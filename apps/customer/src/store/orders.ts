import { create } from 'zustand';
import type { BidDto, GeoPoint, OrderDto, OrderStatus } from '@pijar/shared';
import { Alert } from 'react-native';
import { useAuth } from './auth';
import { api, ApiError } from '../lib/api';
import { realtime } from '../lib/realtime';

/** Posisi live mitra untuk order yang sedang berjalan (tracking). */
export interface TrackingState {
  orderId: string;
  location: GeoPoint;
  heading?: number;
  at: string;
}

interface OrderState {
  myOrders: OrderDto[];
  activeOrder: OrderDto | null;
  tracking: TrackingState | null;
  loadingMyOrders: boolean;
  myOrdersError: string | null;
  fetchMyOrders: () => Promise<void>;
  fetchOrder: (orderId: string) => Promise<OrderDto>;
  createOrder: (dto: Parameters<typeof createOrderDto>[0]) => Promise<OrderDto>;
  acceptBid: (orderId: string, bidId: string) => Promise<OrderDto>;
  cancelOrder: (orderId: string, reason: string) => Promise<OrderDto>;
  bindRealtime: () => () => void;
}

type CreateOrderInput = {
  serviceId: string;
  addressLabel: string;
  addressDetail: string;
  location: GeoPoint;
  scheduledAt?: string | null;
  customerPrice: number;
  therapistGenderPreference?: 'MALE' | 'FEMALE' | null;
  notes?: string;
};

async function createOrderDto(dto: CreateOrderInput): Promise<OrderDto> {
  return api<OrderDto>('/orders', { method: 'POST', body: JSON.stringify(dto) });
}

/** Gabungkan bid baru ke dalam order yang sesuai; false bila tidak relevan. */
function mergeBid(order: OrderDto, bid: BidDto): OrderDto {
  const others = order.bids.filter((b) => b.mitraId !== bid.mitraId);
  return { ...order, bids: [...others, bid] };
}

/** Urutan status untuk pengelompokan (terbaru/aktif dulu). */
function statusRank(status: OrderStatus): number {
  const rank: Record<OrderStatus, number> = {
    BIDDING: 0,
    MATCHED: 1,
    MITRA_ON_THE_WAY: 2,
    ARRIVED: 3,
    IN_PROGRESS: 4,
    COMPLETED: 5,
    SETTLED: 6,
    CANCELLED: 7,
    DRAFT: 8,
  };
  return rank[status] ?? 99;
}

export const useOrders = create<OrderState>((set, get) => ({
  myOrders: [],
  activeOrder: null,
  tracking: null,
  loadingMyOrders: false,
  myOrdersError: null as string | null,
  async fetchMyOrders() {
    set({ loadingMyOrders: true, myOrdersError: null });
    try {
      const orders = await api<OrderDto[]>('/orders/mine');
      set({ myOrders: orders });
      const active = orders.find((o) => statusRank(o.status) < 5) ?? null;
      set({ activeOrder: active, tracking: get().tracking?.orderId === active?.id ? get().tracking : null });
      for (const order of orders) if (statusRank(order.status) < 5) realtime.joinOrder(order.id);
    } catch (error) {
      const message = error instanceof ApiError ? error.display : error instanceof Error ? error.message : 'Gagal memuat pesanan';
      set({ myOrdersError: message });
      Alert.alert('Gagal memuat pesanan', message);
      throw error;
    } finally {
      set({ loadingMyOrders: false });
    }
  },

  async fetchOrder(orderId) {
    try {
      const order = await api<OrderDto>(`/orders/${orderId}`);
      set((s) => {
        const next = s.myOrders.some((o) => o.id === order.id)
          ? s.myOrders.map((o) => (o.id === order.id ? order : o))
          : [order, ...s.myOrders];
        return { myOrders: next, activeOrder: next.find((o) => statusRank(o.status) < 5) ?? null };
      });
      return order;
    } catch (error) {
      Alert.alert('Gagal memuat pesanan', error instanceof ApiError ? error.display : error instanceof Error ? error.message : 'Gagal memuat pesanan');
      throw error;
    }
  },

  async createOrder(dto) {
    const order = await createOrderDto(dto);
    set((s) => ({ myOrders: [order, ...s.myOrders], activeOrder: order }));
    realtime.joinOrder(order.id);
    return order;
  },

  async acceptBid(orderId, bidId) {
    const order = await api<OrderDto>(`/orders/${orderId}/accept-bid`, {
      method: 'POST',
      body: JSON.stringify({ bidId }),
    });
    set((s) => ({
      myOrders: s.myOrders.map((o) => (o.id === order.id ? order : o)),
      activeOrder: order.id === s.activeOrder?.id ? order : s.activeOrder,
    }));
    return order;
  },

  async cancelOrder(orderId, reason) {
    const order = await api<OrderDto>(`/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    set((s) => ({
      myOrders: s.myOrders.map((o) => (o.id === order.id ? order : o)),
      activeOrder: order.id === s.activeOrder?.id ? null : s.activeOrder,
      tracking: null,
    }));
    return order;
  },

  /**
   * Pasang listener realtime global (dipanggil sekali dari layout root).
   * Semua event di-merge ke myOrders/activeOrder/tracking — layar tinggal baca store.
   */
  bindRealtime() {
    const subscriptions: (() => void)[] = [];
    subscriptions.push(realtime.onReconnect(async () => {
      const ids = realtime.orderIds;
      await get().fetchMyOrders();
      await Promise.all(ids.map((id) => get().fetchOrder(id)));
    }));
    // Payload order penuh (order:new / order:matched) — kontrak OrderDto.
    const isOrderPayload = (d: unknown): d is OrderDto =>
      d !== null && typeof d === 'object' && 'id' in d && 'status' in d && 'service' in d && 'address' in d;

    subscriptions.push(realtime.on('order:new', (data) => {
      if (!isOrderPayload(data)) return;
      set((s) => ({
        myOrders: s.myOrders.some((o) => o.id === data.id)
          ? s.myOrders.map((o) => (o.id === data.id ? data : o))
          : [data, ...s.myOrders],
        activeOrder: s.activeOrder?.id === data.id ? data : s.activeOrder,
      }));
    }));

    subscriptions.push(realtime.on('order:bid', (data) => {
      if (data === null || typeof data !== 'object' || !('orderId' in data) || !('mitraId' in data) || !('price' in data)) return;
      const bid = data as unknown as BidDto;
      set((s) => ({
        myOrders: s.myOrders.map((o) => (o.id === bid.orderId ? mergeBid(o, bid) : o)),
        activeOrder: s.activeOrder && s.activeOrder.id === bid.orderId ? mergeBid(s.activeOrder, bid) : s.activeOrder,
      }));
    }));

    subscriptions.push(realtime.on('order:status', (data) => {
      if (
        data === null ||
        typeof data !== 'object' ||
        !('orderId' in data) ||
        !('status' in data) ||
        typeof data.orderId !== 'string' ||
        typeof data.status !== 'string'
      ) {
        return;
      }
      const { orderId, status } = data as { orderId: string; status: OrderStatus };
      set((s) => {
        const update = (o: OrderDto): OrderDto => (o.id === orderId ? { ...o, status } : o);
        return {
          myOrders: s.myOrders.map(update),
          activeOrder: s.activeOrder?.id === orderId && statusRank(status) >= 5 ? null : s.activeOrder ? update(s.activeOrder) : null,
          tracking: s.tracking?.orderId === orderId && statusRank(status) >= 5 ? null : s.tracking,
        };
      });
      // Sinkron ulang detail penuh agar finalPrice/mitra ikut ter-refresh.
      void get().fetchOrder(orderId).catch(() => undefined);
    }));

    subscriptions.push(realtime.on('order:matched', (data) => {
      if (!isOrderPayload(data)) return;
      realtime.joinOrder(data.id);
      set((s) => ({
        myOrders: s.myOrders.some((o) => o.id === data.id)
          ? s.myOrders.map((o) => (o.id === data.id ? data : o))
          : [data, ...s.myOrders],
        activeOrder: s.activeOrder?.id === data.id ? data : s.activeOrder,
      }));
    }));

    subscriptions.push(realtime.on('order:cancelled', (data) => {
      if (data === null || typeof data !== 'object' || !('orderId' in data) || typeof data.orderId !== 'string') return;
      const orderId = data.orderId;
      realtime.leaveOrder(orderId);
      set((s) => {
        const update = (o: OrderDto): OrderDto =>
          o.id === orderId ? { ...o, status: 'CANCELLED' } : o;
        return {
          myOrders: s.myOrders.map(update),
          activeOrder: s.activeOrder?.id === orderId ? null : s.activeOrder,
          tracking: s.activeOrder?.id === orderId ? null : s.tracking,
        };
      });
      void get().fetchOrder(orderId).catch(() => undefined);
    }));

    subscriptions.push(realtime.on('tracking:location', (data) => {
      if (data === null || typeof data !== 'object' || !('orderId' in data) || !('location' in data)) return;
      const loc = data.location;
      if (loc !== null && typeof loc === 'object' && 'lat' in loc && 'lng' in loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        set({
          tracking: {
            orderId: data.orderId as string,
            location: { lat: loc.lat, lng: loc.lng },
            heading: typeof data.heading === 'number' ? data.heading : undefined,
            at: typeof data.at === 'string' ? data.at : new Date().toISOString(),
          },
        });
      }
    }));
    return () => { for (const unsubscribe of subscriptions) unsubscribe(); };
  },
}));

useAuth.subscribe((state, previous) => {
  if (state.sessionVersion !== previous.sessionVersion) {
    useOrders.setState({ myOrders: [], activeOrder: null, tracking: null, loadingMyOrders: false });
  }
});
