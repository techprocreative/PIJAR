// Context React untuk sesi admin — mencerminkan state modul session.ts ke UI.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AuthTokensDto, UserDto } from '@pijar/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  clearSession,
  getSession,
  getSessionGeneration,
  setSession,
  subscribeSession,
  type AdminSession,
} from './session';

interface SessionContextValue {
  user: UserDto | null;
  /** Login via OTP (kode dev muncul di log server saat DEV_MODE). */
  login: (tokens: AuthTokensDto) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AdminSession | null>(() => getSession());

  const queryClient = useQueryClient();
  useEffect(() => {
    let generation = getSessionGeneration();
    const update = (next: AdminSession | null) => {
      if (generation !== getSessionGeneration()) {
        queryClient.clear();
        generation = getSessionGeneration();
      }
      setSessionState(next);
    };
    const unsubscribe = subscribeSession(update);
    update(getSession());
    return unsubscribe;
  }, [queryClient]);

  const value: SessionContextValue = {
    user: session?.user ?? null,
    login: (tokens) => setSession(tokens),
    logout: clearSession,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession harus dipakai di dalam <SessionProvider>');
  return ctx;
}
