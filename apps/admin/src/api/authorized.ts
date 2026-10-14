// authorizedFetch: akses ber-token dengan refresh sekali-jalan saat 401.
// Semua query/mutation admin memakai helper ini (bukan fetchJson mentah).

import { clearSession, getSession, getSessionGeneration, peekAccessToken, setSession } from '../auth/session';
import { ApiError, refreshTokens, toApiError } from './http';

let refreshInFlight: { generation: number; promise: Promise<string> } | null = null;

function requireGeneration(generation: number): void {
  if (!getSession() || generation !== getSessionGeneration()) {
    throw new ApiError(401, 'Sesi berakhir — silakan login ulang');
  }
}

/** HTTP dan WS berbagi rotasi; 401 terlambat memakai token yang sudah diperbarui. */
export async function getFreshToken(
  failedToken = peekAccessToken(),
  generation = getSessionGeneration(),
): Promise<string> {
  requireGeneration(generation);
  const session = getSession()!;
  if (session.accessToken !== failedToken) return session.accessToken;
  if (!refreshInFlight || refreshInFlight.generation !== generation) {
    const pending = {
      generation,
      promise: refreshTokens(session.refreshToken).then((tokens) => {
        requireGeneration(generation);
        setSession(tokens, session);
        return tokens.accessToken;
      }).catch((error: unknown) => {
        // Gangguan jaringan/server tidak menghapus refresh token yang masih valid.
        if (getSession() === session && error instanceof ApiError &&
            (error.status === 401 || error.status === 403)) clearSession();
        throw error;
      }).finally(() => {
        if (refreshInFlight === pending) refreshInFlight = null;
      }),
    };
    refreshInFlight = pending;
  }
  return refreshInFlight.promise;
}

export async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const generation = getSessionGeneration();
  requireGeneration(generation);
  const doFetch = (token: string) => {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    headers.set('authorization', `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  };

  let token = peekAccessToken();
  let res = await doFetch(token);
  requireGeneration(generation);
  if (res.status === 401) {
    token = await getFreshToken(token, generation);
    requireGeneration(generation);
    res = await doFetch(token);
    requireGeneration(generation);
    if (res.status === 401 && getSession()?.accessToken === token) {
      clearSession();
      throw new ApiError(401, 'Sesi berakhir — silakan login ulang');
    }
  }
  return res;
}

/** Versi JSON: lempar ApiError bila !ok. */
export async function authorizedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authorizedFetch(path, init);
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
