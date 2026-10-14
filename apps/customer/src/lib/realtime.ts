import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ServerEvent } from '@pijar/shared';
import { Alert } from 'react-native';
import { WS_URL } from '../config';
import { useAuth } from '../store/auth';

type ServerListener = (payload: ServerEvent['data']) => void;
type Listener = { event: ServerEvent['event'] | '*'; fn: ServerListener };

/**
 * Gateway realtime customer:
 * - connect ke namespace /ws dengan access token (handshake JWT, lihat ARCHITECTURE.md)
 * - auto-connect saat sesi tersedia, auto-reconnect saat token berubah
 * - `joinOrder(orderId)` → room order:{orderId} untuk bidding/tracking
 * - listener per-event dengan kontrak ServerEvent (@pijar/shared)
 */
class RealtimeGateway {
  private socket: Socket | null = null;
  private listeners = new Set<Listener>();
  private joinedOrders = new Set<string>();
  private connectedToken: string | null = null;
  private reconnectListeners = new Set<() => Promise<void>>();
  private authRecoveryAttempted = false;

  connect(): void {
    const token = useAuth.getState().session?.accessToken;
    if (!token || token === this.connectedToken) return;

    this.disposeSocket();
    this.connectedToken = token;
    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    this.socket = socket;

    socket.on('connect_error', (error: Error) => Alert.alert('Koneksi realtime gagal', error.message));
    socket.on('exception', (error: { message?: string }) => {
      Alert.alert('Realtime gagal', error?.message ?? 'Permintaan realtime ditolak');
    });
    socket.onAny((eventName, payload) => {
      if (this.socket !== socket || !payload || typeof payload !== 'object' || payload.event !== eventName || !('data' in payload)) return;
      for (const l of [...this.listeners]) {
        if (l.event === '*' || l.event === eventName) l.fn(payload.data as ServerEvent['data']);
      }
    });
    socket.on('disconnect', (reason) => {
      if (reason !== 'io server disconnect' || this.socket !== socket) return;
      this.connectedToken = null;
      if (this.authRecoveryAttempted) {
        Alert.alert('Koneksi realtime gagal', 'Sesi realtime ditolak. Silakan masuk kembali.');
        return;
      }
      this.authRecoveryAttempted = true;
      void useAuth.getState().tryRefresh().then((ok) => {
        if (ok) this.connect();
        else Alert.alert('Sesi berakhir', 'Silakan masuk kembali');
      }).catch((error: unknown) => Alert.alert('Koneksi realtime gagal', error instanceof Error ? error.message : 'Gagal memperbarui sesi'));
    });
    socket.on('connect', () => {
      void (async () => {
        for (const orderId of this.joinedOrders) await this.joinRoom(socket, orderId);
        if (this.socket !== socket || !socket.connected) return;
        await Promise.all([...this.reconnectListeners].map((sync) => sync()));
      })().catch((error: unknown) => Alert.alert('Sinkronisasi gagal', error instanceof Error ? error.message : 'Gagal menyinkronkan pesanan'));
    });
  }

  /** Join room order — idempoten; re-join otomatis setelah reconnect. */
  joinOrder(orderId: string): void {
    if (this.joinedOrders.has(orderId)) return;
    this.joinedOrders.add(orderId);
    const socket = this.socket;
    if (socket?.connected) {
      void this.joinRoom(socket, orderId).catch((error: unknown) => Alert.alert('Realtime gagal', error instanceof Error ? error.message : 'Gagal mengikuti pesanan'));
    }
  }

  leaveOrder(orderId: string): void {
    this.joinedOrders.delete(orderId);
  }

  private async joinRoom(socket: Socket, orderId: string): Promise<void> {
    const ack = await socket.timeout(10000).emitWithAck('order:join', { orderId });
    if (ack?.ok !== true) throw new Error(ack?.message ?? 'Gagal mengikuti pesanan');
    if (this.socket === socket) this.authRecoveryAttempted = false;
  }

  onReconnect(sync: () => Promise<void>): () => void {
    this.reconnectListeners.add(sync);
    return () => { this.reconnectListeners.delete(sync); };
  }

  get orderIds(): string[] {
    return [...this.joinedOrders];
  }

  on(event: ServerEvent['event'] | '*', fn: ServerListener): () => void {
    const listener = { event, fn };
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  private disposeSocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  disconnect(): void {
    this.connectedToken = null;
    this.authRecoveryAttempted = false;
    this.joinedOrders.clear();
    this.disposeSocket();
  }
}

export const realtime = new RealtimeGateway();

// Satu langganan auth global: ganti socket saat token berubah (login/refresh/logout).
useAuth.subscribe((state) => {
  const tokenNow = state.session?.accessToken ?? null;
  if (tokenNow === null) {
    realtime.disconnect();
    return;
  }
  realtime.connect();
});
