// Auth API: OTP request/verify (admin) — dipakai halaman Login.

import type { AuthTokensDto } from '@pijar/shared';
import { fetchJson } from './http';

export async function requestOtp(phone: string): Promise<{ ok: true; devCode?: string }> {
  return fetchJson<{ ok: true; devCode?: string }>('/v1/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<AuthTokensDto> {
  return fetchJson<AuthTokensDto>('/v1/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code, role: 'ADMIN' }),
  });
}
