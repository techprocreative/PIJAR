// State sesi admin (singleton non-React): persist localStorage + refresh rotation.
// SessionProvider hanya mencerminkan state ke UI; semua HTTP/WS memakai modul ini.

import type { AuthTokensDto, UserDto } from '@pijar/shared';

const STORAGE_KEY = 'pijar.admin.session';

export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

let current: AdminSession | null = loadFromStorage();
let generation = 0;
const listeners = new Set<(s: AdminSession | null) => void>();

function loadFromStorage(): AdminSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (typeof parsed?.accessToken !== 'string' || !parsed.accessToken ||
        typeof parsed.refreshToken !== 'string' || !parsed.refreshToken ||
        parsed.user?.role !== 'ADMIN') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSession(): AdminSession | null {
  return current;
}

export function getSessionGeneration(): number {
  return generation;
}

/** Token akses terkini (bisa expired — pemanggil HTTP sebaiknya lewat authorizedFetch). */
export function peekAccessToken(): string {
  if (!current) throw new Error('Belum login');
  return current.accessToken;
}

export function setSession(tokens: AuthTokensDto, refreshOf?: AdminSession): AdminSession {
  if (refreshOf && current !== refreshOf) throw new Error('Sesi telah berubah');
  if (tokens.user.role !== 'ADMIN') throw new Error('Akses admin diperlukan');
  if (!refreshOf) generation += 1;
  current = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: tokens.user,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  for (const l of listeners) l(current);
  return current;
}

export function clearSession(): void {
  generation += 1;
  current = null;
  localStorage.removeItem(STORAGE_KEY);
  for (const l of listeners) l(null);
}

export function subscribeSession(listener: (s: AdminSession | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
