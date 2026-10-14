/**
 * Sesi mitra disimpan di AsyncStorage (tidak terenkripsi).
 * Menyimpan AuthTokensDto (@pijar/shared) — access 15m, refresh 30d dengan rotasi.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthTokensDto } from '@pijar/shared';
import { ASYNC_STORAGE_KEYS } from '../config/env';

let writes: Promise<void> = Promise.resolve();

export async function loadSession(): Promise<AuthTokensDto | null> {
  try {
    const raw = await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.auth);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthTokensDto;
    if (!parsed?.accessToken || !parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(tokens: AuthTokensDto): Promise<void> {
  const next = writes.then(() => AsyncStorage.setItem(ASYNC_STORAGE_KEYS.auth, JSON.stringify(tokens)));
  writes = next.catch(() => undefined);
  return next;
}

export function clearSession(): Promise<void> {
  const next = writes.then(() => AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.auth));
  writes = next.catch(() => undefined);
  return next;
}

