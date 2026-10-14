import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from './state/auth';
import { useOrderStore } from './state/orders';
import { useWalletStore } from './state/wallet';
import { connectSocket, getSocket, setSocket } from './realtime/socket';
import { handleServerEvent, stopLocationTracking, syncConnection } from './services/location';
import { tryRefresh } from './api/client';
import { AppNavigator } from './navigation';

export default function App() {
  const userId = useAuthStore((s) => s.tokens?.user.id);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => { void bootstrap(); }, [bootstrap]);

  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    let recoveredAuth = false;
    const sock = connectSocket(handleServerEvent);
    const report = (err: unknown) => {
      if (!disposed) useOrderStore.setState({ error: err instanceof Error ? err.message : String(err) });
    };
    sock.on('connect', () => { void syncConnection().catch(report); });
    sock.on('connect_error', report);
    sock.on('exception', (err: { message?: string }) => report(err.message ?? 'Permintaan realtime ditolak'));
    sock.on('disconnect', (reason: string) => {
      if (reason !== 'io server disconnect' || disposed) return;
      void (async () => {
        if (recoveredAuth) { report('Sesi realtime ditolak. Silakan masuk kembali.'); return; }
        recoveredAuth = true;
        if (await tryRefresh()) { if (!disposed) sock.connect(); }
        else report('Sesi berakhir atau server tidak tersedia. Silakan masuk kembali.');
      })();
    });
    sock.connect();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (sock.connected) void syncConnection().catch(report);
        else sock.connect();
      }
    });
    return () => {
      disposed = true;
      appState.remove();
      sock.removeAllListeners();
      sock.disconnect();
      if (getSocket() === sock) setSocket(null);
      void stopLocationTracking().catch((err) => useOrderStore.setState({ error: String(err) }));
      useOrderStore.setState({ active: null, newOrders: [], online: false, busy: false, error: null });
      useWalletStore.setState({ wallet: null, transactions: [], total: 0, page: 1, loading: false, error: null });
    };
  }, [userId]);

  return <AppNavigator />;
}
