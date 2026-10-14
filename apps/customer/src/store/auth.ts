import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthTokensDto, Role, UserDto } from '@pijar/shared';
import { API_URL } from '../config';
import { api } from '../lib/api';

const SESSION_KEY = 'pijar.session.v1';

/** Bentuk persisten di SecureStore — pasangan token terakhir yang diketahui valid. */
interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  /** null = belum selesai restore (splash); undefined = tidak ada sesi. */
  session: StoredSession | undefined | null;
  user: UserDto | null;
  sessionVersion: number;
  hydrate: () => Promise<void>;
  login: (tokens: AuthTokensDto) => Promise<void>;
  tryRefresh: () => Promise<boolean>;
  logout: () => Promise<void>;
}

async function readStoredSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    'accessToken' in parsed &&
    'refreshToken' in parsed &&
    typeof parsed.accessToken === 'string' &&
    typeof parsed.refreshToken === 'string' &&
    parsed.accessToken.length > 0 &&
    parsed.refreshToken.length > 0
  ) {
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  }
  return null;
}

async function persistSession(session: StoredSession | null): Promise<void> {
  if (session) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } else {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}

// Serialize disk writes so an older refresh cannot overwrite logout/new login.
let persistence: Promise<void> = Promise.resolve();
function saveSession(session: StoredSession | null): Promise<void> {
  const next = persistence.catch(() => undefined).then(() => persistSession(session));
  persistence = next;
  return next;
}
let refresh: { version: number; promise: Promise<boolean> } | null = null;

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  sessionVersion: 0,

  async hydrate() {
    if (get().session !== null) return;
    const version = get().sessionVersion;
    try {
      const stored = await readStoredSession();
      if (get().sessionVersion !== version || get().session !== null) return;
      set({ session: stored ?? undefined });
      if (stored) {
        const user = await api<UserDto>('/auth/me');
        if (get().sessionVersion === version) set({ user });
      }
    } catch (error) {
      if (get().sessionVersion === version && get().session === null) {
        set({ session: undefined, user: null });
      }
      throw error;
    }
  },

  async login(tokens) {
    const version = get().sessionVersion + 1;
    set({ sessionVersion: version, session: undefined, user: null });
    const pair = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    await saveSession(pair);
    if (get().sessionVersion === version) set({ session: pair, user: tokens.user });
  },

  async tryRefresh() {
    const current = get().session;
    const version = get().sessionVersion;
    if (!current?.refreshToken) return false;
    if (refresh?.version === version) return refresh.promise;
    const promise = (async () => {
      const res = await fetch(`${API_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (get().sessionVersion !== version) return false;
      if (res.status === 401 || res.status === 403) {
        await get().logout();
        return false;
      }
      if (!res.ok) throw new Error(`Gagal memperbarui sesi (${res.status})`);
      const tokens = (await res.json()) as AuthTokensDto;
      if (!tokens.accessToken || !tokens.refreshToken || !tokens.user?.id) {
        throw new Error('Respons pembaruan sesi tidak valid');
      }
      if (get().sessionVersion !== version) return false;
      const pair = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
      await saveSession(pair);
      if (get().sessionVersion !== version) return false;
      set({ session: pair, user: tokens.user });
      return true;
    })();
    refresh = { version, promise };
    try {
      return await promise;
    } finally {
      if (refresh?.promise === promise) refresh = null;
    }
  },

  async logout() {
    set({ sessionVersion: get().sessionVersion + 1, session: undefined, user: null });
    await saveSession(null);
  },
}));

/** Role untuk app customer — selalu CUSTOMER. */
export const LOGIN_ROLE: Role = 'CUSTOMER';
