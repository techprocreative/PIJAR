import { API_URL } from '../config';
import { useAuth } from '../store/auth';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Pesan tampilan — dipetakan dari message backend (string | string[] | objek). */
    public display: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Options = Omit<RequestInit, 'headers'> & { headers?: Record<string, string>; skipAuth?: boolean };

/** Ambil pesan tampilan dari bentuk message Nest (string | string[] | objek). */
function toDisplay(payload: unknown, fallback: string): string {
  if (payload !== null && typeof payload === 'object' && 'message' in payload) {
    const m = payload.message; // unknown — validasi sebelum dipakai
    if (typeof m === 'string' && m.trim()) return m;
    if (Array.isArray(m) && m.length > 0 && typeof m[0] === 'string') return m.join(', ');
  }
  return fallback;
}

async function rawRequest<T>(path: string, options: Options, token?: string): Promise<T> {
  const { skipAuth, ...init } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  if (!skipAuth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/v1${path}`, { ...init, headers });
  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    if (res.ok) throw new ApiError('Respons server tidak valid', res.status, 'Respons server tidak valid');
  }

  if (!res.ok) {
    throw new ApiError(
      `HTTP ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      toDisplay(payload, `Terjadi kesalahan (${res.status})`),
    );
  }
  return payload as T;
}

/** Request dengan refresh-token rotation otomatis saat 401 (sekali per request). */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { session, sessionVersion } = useAuth.getState();
  try {
    const result = await rawRequest<T>(path, options, session?.accessToken);
    if (!options.skipAuth && useAuth.getState().sessionVersion !== sessionVersion) {
      throw new ApiError('Sesi berubah', 401, 'Sesi berubah — silakan ulangi');
    }
    return result;
  } catch (err) {
    const needRefresh = err instanceof ApiError && err.status === 401 && !options.skipAuth;
    if (!needRefresh) throw err;

    if (useAuth.getState().sessionVersion !== sessionVersion) throw err;
    const changed = useAuth.getState().session?.accessToken !== session?.accessToken;
    const refreshed = changed || await useAuth.getState().tryRefresh();
    if (!refreshed || useAuth.getState().sessionVersion !== sessionVersion) {
      throw new ApiError('Sesi berakhir', 401, 'Sesi berakhir — silakan masuk kembali');
    }
    const result = await rawRequest<T>(path, options, useAuth.getState().session?.accessToken);
    if (useAuth.getState().sessionVersion !== sessionVersion) {
      throw new ApiError('Sesi berubah', 401, 'Sesi berubah — silakan ulangi');
    }
    return result;
  }
}
