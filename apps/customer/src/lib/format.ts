import { OrderStatus } from '@pijar/shared';

const RUPIAH = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function rupiah(amount: number): string {
  return RUPIAH.format(amount).replace(/\s/g, ' ');
}

/** Label status order — dipakai di beberapa layar; kontrak tampilan stabil. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Draf',
  BIDDING: 'Menunggu terapis',
  MATCHED: 'Terapis dipilih',
  MITRA_ON_THE_WAY: 'Terapis menuju lokasi',
  ARRIVED: 'Terapis tiba',
  IN_PROGRESS: 'Pijat berlangsung',
  COMPLETED: 'Selesai',
  SETTLED: 'Selesai & dibayar',
  CANCELLED: 'Dibatalkan',
};

/** Status aktif = order berjalan (tampil di tab Beranda). */
export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'BIDDING',
  'MATCHED',
  'MITRA_ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
];

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Sekarang';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Jarak tampilan: "850 m" / "3,2 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace('.', ',')} km`;
}
