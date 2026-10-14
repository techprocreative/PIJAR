/**
 * Auth store — sesi OTP mitra + token refresh rotation.
 * State dimuat dari secure storage saat app start (bootstrap).
 */
import { create } from 'zustand';
import type { AuthTokensDto } from '@pijar/shared';
import { observeTokenRefresh, setTokens } from '../api/client';
import { requestOtp, verifyOtp } from '../api/client';
import { clearSession, loadSession, saveSession } from '../api/storage';

type Phase = 'boot' | 'idle' | 'requesting' | 'verifying';

interface AuthState {
  phase: Phase;
  error: string | null;
  devCode: string | null; // DEV_MODE=true: server mengembalikan kode untuk pengujian
  tokens: AuthTokensDto | null;
  bootstrap: () => Promise<void>;
  login: (phone: string, code: string, name?: string) => Promise<boolean>;
  sendOtp: (phone: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  phase: 'boot',
  error: null,
  devCode: null,
  tokens: null,

  async bootstrap() {
    const tokens = await loadSession();
    if (tokens) {
      setTokens(tokens);
      set({ tokens, phase: 'idle' });
    } else {
      set({ phase: 'idle' });
    }
  },

  async sendOtp(phone: string) {
    set({ phase: 'requesting', error: null, devCode: null });
    try {
      const res = await requestOtp(phone);
      set({ phase: 'idle', devCode: res.devCode ?? null });
      return true;
    } catch (err) {
      set({ phase: 'idle', error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async login(phone: string, code: string, name?: string) {
    set({ phase: 'verifying', error: null });
    try {
      const tokens = await verifyOtp(phone, code, 'MITRA', name);
      await saveSession(tokens);
      setTokens(tokens);
      set({ tokens, phase: 'idle' });
      return true;
    } catch (err) {
      set({ phase: 'idle', error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async logout() {
    setTokens(null);
    set({ tokens: null, devCode: null, error: null });
    await clearSession();
  },

  clearError() {
    set({ error: null });
  },
}));

observeTokenRefresh((tokens) => useAuthStore.setState({ tokens }));

/** ID user mitra terlogin (dipakai pemetaan bid milik sendiri). */
export function currentUserId(): string | null {
  return useAuthStore.getState().tokens?.user.id ?? null;
}
