/**
 * Konstanta aturan bisnis (harus sinkron dengan apps/api).
 * Lihat apps/api/src/orders/orders.service.ts & bids/bids.service.ts.
 */
import type { OrderStatus } from '@pijar/shared';

/** Transisi legal state machine order. */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['BIDDING', 'CANCELLED'],
  BIDDING: ['MATCHED', 'CANCELLED'],
  MATCHED: ['MITRA_ON_THE_WAY', 'CANCELLED'],
  MITRA_ON_THE_WAY: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['SETTLED'],
  SETTLED: [],
  CANCELLED: [],
};

/** Aksi mitra → status berikutnya (tombol utama di layar order aktif). */
export const MITRA_NEXT_ACTION: Partial<
  Record<OrderStatus, { label: string; next: OrderStatus }>
> = {
  MATCHED: { label: 'Mulai Jalan ke Lokasi', next: 'MITRA_ON_THE_WAY' },
  MITRA_ON_THE_WAY: { label: 'Sudah Sampai', next: 'ARRIVED' },
  ARRIVED: { label: 'Mulai Pengerjaan', next: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'Selesaikan Order', next: 'COMPLETED' },
};

/** Minimum counter-bid = 50% tawaran customer (aturan server). */
export const COUNTER_BID_MIN_FACTOR = 0.5;
/** Maksimum counter-bid = 3x tawaran customer (aturan server). */
export const COUNTER_BID_MAX_FACTOR = 3;

/** Format rupiah tanpa sen (angka integer, konsisten skema DB). */
export function formatRupiah(amount: number): string {
  return `Rp${amount.toLocaleString('id-ID')}`;
}
