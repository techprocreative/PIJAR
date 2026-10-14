// Koneksi Socket.IO namespace /ws (handshake token JWT — lihat RealtimeGateway).
// Admin otomatis join room `admin` di sisi server.

import { io, type Socket } from 'socket.io-client';
import type { ServerEvent } from '@pijar/shared';
import { clearSession, getSession, getSessionGeneration, subscribeSession } from '../auth/session';
import { getFreshToken } from '../api/authorized';

let socket: Socket | null = null;
let refCount = 0;
let disposeSocket: (() => void) | null = null;

/**
 * Ambil (atau buat) koneksi WS tunggal untuk admin.
 * Refcount dipakai agar beberapa komponen bisa berlangganan tanpa membuka socket ganda.
 */
export function getAdminSocket(): Socket {
  if (!socket) {
    const generation = getSessionGeneration();
    let handshakeToken = '';
    let recovery: number | undefined;
    let recovering = false;
    let retryDelay = 1_000;
    let rejectedAfterRefresh = false;
    const s = io('/ws', {
      autoConnect: false,
      auth: (callback) => {
        const session = getSession();
        if (!session || generation !== getSessionGeneration()) return;
        handshakeToken = session.accessToken;
        let expiresAt = 0;
        try {
          const payload = handshakeToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          expiresAt = JSON.parse(atob(payload)).exp * 1_000;
        } catch { /* Token tidak valid akan ditolak server. */ }
        if (expiresAt > 0 && expiresAt <= Date.now() + 30_000) {
          void getFreshToken(handshakeToken, generation).then((token) => {
            if (socket !== s || generation !== getSessionGeneration()) return;
            handshakeToken = token;
            callback({ token });
          }).catch(() => { recover(); });
        } else {
          callback({ token: handshakeToken });
        }
      },
      transports: ['websocket', 'polling'],
    });
    socket = s;
    const recover = () => {
      if (recovering || recovery || socket !== s || !getSession() ||
          generation !== getSessionGeneration()) return;
      // Server disconnect tidak diretry Socket.IO; beri jeda agar penolakan tidak berputar cepat.
      recovery = window.setTimeout(() => {
        recovery = undefined;
        recovering = true;
        void getFreshToken(handshakeToken, generation).then(() => {
          if (socket === s && getSession() && generation === getSessionGeneration()) {
            s.disconnect().connect();
          }
        }).catch(() => {
          if (socket === s && getSession() && generation === getSessionGeneration()) {
            recovering = false;
            recover();
          }
        }).finally(() => { recovering = false; });
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    };
    s.on('disconnect', (reason) => {
      if (reason !== 'io server disconnect') return;
      if (rejectedAfterRefresh) {
        if (generation === getSessionGeneration()) clearSession();
        return;
      }
      rejectedAfterRefresh = true;
      recover();
    });
    s.on('connect_error', () => {
      // Gangguan transport diretry manager; penolakan handshake memerlukan refresh.
      if (s.active) return;
      if (rejectedAfterRefresh) {
        if (generation === getSessionGeneration()) clearSession();
        return;
      }
      rejectedAfterRefresh = true;
      recover();
    });
    const unsubscribe = subscribeSession((session) => {
      if (!session || generation !== getSessionGeneration()) {
        clearTimeout(recovery);
        recovery = undefined;
        s.disconnect();
      }
    });
    disposeSocket = () => {
      unsubscribe();
      clearTimeout(recovery);
      s.removeAllListeners();
      s.close();
    };
    s.connect();
  }
  refCount += 1;
  return socket;
}

/** Lepas referensi — socket ditutup bila sudah tidak ada pemakai. */
export function releaseAdminSocket(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && socket) {
    disposeSocket?.();
    disposeSocket = null;
    socket = null;
  }
}

/**
 * Hook langganan event server. Callback menerima payload event apa pun dari
 * ServerEvent (order:new, order:status, order:cancelled, dll — semuanya juga
 * di-emit ke room `admin` oleh gateway).
 */
export function subscribeAdminEvents(
  handler: (event: ServerEvent) => void,
  onConnect: () => void,
): () => void {
  const s = getAdminSocket();
  const events = [
    'order:new',
    'order:bid',
    'order:matched',
    'order:status',
    'order:cancelled',
    'tracking:location',
    'mitra:status',
    'wallet:updated',
  ] as const;
  for (const e of events) s.on(e, handler);
  s.on('connect', onConnect);
  if (s.connected) onConnect();
  return () => {
    for (const e of events) s.off(e, handler);
    s.off('connect', onConnect);
    releaseAdminSocket();
  };
}
