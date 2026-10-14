import { create } from 'zustand';
import type { BidDto, OrderDto, OrderStatus } from '@pijar/shared';
import { cancelOrder as apiCancel, getOrder, listMyOrders, placeBid as apiPlaceBid, transitionStatus as apiTransition } from '../api/client';
import { getSocket, joinOrderRoom, sendLocation } from '../realtime/socket';
import { MITRA_NEXT_ACTION } from '../constants';
import { currentUserId } from './auth';

export interface NewOrderEntry {
  order: OrderDto;
  receivedAt: number;
  myBid: BidDto | null;
}

interface OrderStore {
  newOrders: NewOrderEntry[];
  active: { order: OrderDto; myBidId: string | null } | null;
  online: boolean;
  busy: boolean;
  error: string | null;
  ingestNewOrder: (order: OrderDto) => void;
  expireStaleNewOrders: () => void;
  placeBid: (orderId: string, price: number, etaMinutes: number) => Promise<boolean>;
  adoptMatchedOrder: (order: OrderDto) => Promise<void>;
  transition: (next: OrderStatus) => Promise<boolean>;
  cancelActiveOrder: (reason: string) => Promise<boolean>;
  handleStatusEvent: (orderId: string, status: OrderStatus) => void;
  handleCancelEvent: (orderId: string) => void;
  restoreActiveOrder: () => Promise<void>;
  pushLocation: (loc: { lat: number; lng: number; heading?: number; accuracyM?: number }) => Promise<void>;
  clearError: () => void;
}

const activeStatuses: OrderStatus[] = ['MATCHED', 'MITRA_ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'];

export const useOrderStore = create<OrderStore>((set, get) => ({
  newOrders: [], active: null, online: false, busy: false, error: null,

  ingestNewOrder(order) {
    if (!get().online || get().active || order.status !== 'BIDDING') return;
    set((s) => ({ newOrders: [{ order, receivedAt: Date.now(), myBid: s.newOrders.find((e) => e.order.id === order.id)?.myBid ?? null }, ...s.newOrders.filter((e) => e.order.id !== order.id)].slice(0, 20) }));
  },

  expireStaleNewOrders() {
    const cutoff = Date.now() - 10 * 60_000;
    set((s) => ({ newOrders: s.newOrders.filter((e) => e.order.status === 'BIDDING' && e.receivedAt > cutoff) }));
  },

  async placeBid(orderId, price, etaMinutes) {
    if (get().busy) return false;
    const userId = currentUserId();
    set({ busy: true, error: null });
    try {
      const bid = await apiPlaceBid(orderId, price, etaMinutes);
      if (currentUserId() !== userId) return false;
      set((s) => ({ busy: false, newOrders: s.newOrders.map((e) => e.order.id === orderId ? { ...e, myBid: bid } : e) }));
      return true;
    } catch (err) {
      if (currentUserId() === userId) set({ busy: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async adoptMatchedOrder(order) {
    if (!activeStatuses.includes(order.status)) return;
    set({ active: { order, myBidId: order.bids[0]?.id ?? null }, newOrders: [] });
    const sock = getSocket();
    if (sock?.connected) await joinOrderRoom(sock, order.id);
  },

  async transition(next) {
    const { active, busy } = get();
    if (!active || busy) return false;
    const userId = currentUserId();
    set({ busy: true, error: null });
    try {
      const updated = await apiTransition(active.order.id, next);
      if (currentUserId() !== userId) return false;
      set({ busy: false, active: activeStatuses.includes(updated.status) ? { ...active, order: updated } : null });
      return true;
    } catch (err) {
      if (currentUserId() === userId) set({ busy: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async cancelActiveOrder(reason) {
    const { active, busy } = get();
    if (!active || busy) return false;
    const userId = currentUserId();
    set({ busy: true, error: null });
    try {
      await apiCancel(active.order.id, reason);
      if (currentUserId() !== userId) return false;
      set({ active: null, busy: false });
      return true;
    } catch (err) {
      if (currentUserId() === userId) set({ busy: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  handleStatusEvent(orderId, status) {
    const { active } = get();
    if (active?.order.id === orderId) set({ active: activeStatuses.includes(status) ? { ...active, order: { ...active.order, status } } : null });
    if (status !== 'BIDDING') set((s) => ({ newOrders: s.newOrders.filter((e) => e.order.id !== orderId) }));
  },

  handleCancelEvent(orderId) {
    get().handleStatusEvent(orderId, 'CANCELLED');
  },

  // Server reads recover missed matches and actual status, never bid writes/probes.
  async restoreActiveOrder() {
    const userId = currentUserId();
    if (!userId) return;
    try {
      const orders = await listMyOrders();
      if (currentUserId() !== userId) return;
      const active = orders.find((order) => activeStatuses.includes(order.status));
      if (active) await get().adoptMatchedOrder(active);
      else set({ active: null });
      const pending = get().newOrders.filter((entry) => entry.myBid != null);
      set({ newOrders: pending });
      const refreshed = await Promise.all(pending.map(async (entry) => ({ ...entry, order: await getOrder(entry.order.id) })));
      if (currentUserId() !== userId) return;
      set((state) => ({ newOrders: state.newOrders.flatMap((entry) => {
        const updated = refreshed.find((item) => item.order.id === entry.order.id);
        return updated ? (updated.order.status === 'BIDDING' ? [updated] : []) : [entry];
      }) }));
      get().expireStaleNewOrders();
    } catch (err) {
      if (currentUserId() === userId) set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async pushLocation(loc) {
    const sock = getSocket();
    if (!sock?.connected) throw new Error('Koneksi realtime belum siap');
    const { active } = get();
    await sendLocation(sock, { ...loc, ...(active ? { orderId: active.order.id } : {}) });
  },

  clearError() { set({ error: null }); },
}));

export function nextActionFor(status: OrderStatus) {
  return MITRA_NEXT_ACTION[status] ?? null;
}
