// Fetch wrapper + tipe error terstruktur untuk semua panggilan API admin.
// Endpoint mengikuti AdminController (prefix global /v1 dari main.ts).

import type { AuthTokensDto } from '@pijar/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly message: string,
    readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Pesan error dari body NestJS (message bisa string | string[]). */
export async function toApiError(res: Response): Promise<ApiError> {
  let message = `HTTP ${res.status}`;
  let details: string[] | undefined;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (typeof body.message === 'string') message = body.message;
    else if (Array.isArray(body.message)) {
      message = body.message[0] ?? message;
      details = body.message;
    }
  } catch {
    // body bukan JSON — biarkan pesan default
  }
  return new ApiError(res.status, message, details);
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** POST /v1/auth/refresh — rotasi refresh token (dipakai authorizedFetch). */
export async function refreshTokens(refreshToken: string): Promise<AuthTokensDto> {
  return fetchJson<AuthTokensDto>('/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}
