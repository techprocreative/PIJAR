import { io, type Socket } from 'socket.io-client';
import type { ServerEvent } from '@pijar/shared';
import { WS_URL } from '../config/env';
import { getAccessToken } from '../api/client';

let socket: Socket | null = null;

export function connectSocket(onEvent: (event: ServerEvent) => void): Socket {
  const s = io(WS_URL, {
    autoConnect: false,
    auth: (callback) => callback({ token: getAccessToken() }),
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 10_000,
  });
  s.onAny((name: string, payload: unknown) => {
    if (payload && typeof payload === 'object' && 'event' in payload && payload.event === name) onEvent(payload as ServerEvent);
  });
  socket = s;
  return s;
}

export function getSocket(): Socket | null { return socket; }
export function setSocket(s: Socket | null): void { socket = s; }

/** A missing acknowledgement is a failure, never evidence that a mutation worked. */
async function acknowledged(s: Socket, event: string, data: unknown): Promise<void> {
  if (!s.connected) throw new Error('Koneksi realtime belum siap');
  const response = await s.timeout(8_000).emitWithAck(event, data);
  if (response?.ok !== true) throw new Error(response?.message ?? 'Permintaan realtime ditolak');
}

export function listenOrders(s: Socket, point: { lat: number; lng: number }): Promise<void> {
  return acknowledged(s, 'mitra:listen_orders', point);
}

export function stopListening(s: Socket): Promise<void> {
  return acknowledged(s, 'mitra:stop_orders', {});
}

export function sendLocation(s: Socket, data: { lat: number; lng: number; heading?: number; accuracyM?: number; orderId?: string }): Promise<void> {
  return acknowledged(s, 'mitra:location', data);
}

export function joinOrderRoom(s: Socket, orderId: string): Promise<void> {
  return acknowledged(s, 'order:join', { orderId });
}
