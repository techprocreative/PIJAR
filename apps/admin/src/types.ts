// Tipe khusus admin panel — melengkapi @pijar/shared.
// Bentuk response mengikuti AdminService di apps/api/src/admin/admin.service.ts

import type {
  AdminDashboardDto,
  DisputeDto,
  PromoBannerDto,
  VoucherDto,
  WalletTransactionDto,
} from '@pijar/shared';

export type { AdminDashboardDto, DisputeDto, PromoBannerDto, VoucherDto, WalletTransactionDto };

/** Item verifikasi mitra (AdminService.pendingVerifications). */
export interface PendingVerificationItem {
  mitraId: string;
  userId: string;
  name: string;
  phone: string;
  gender: 'MALE' | 'FEMALE';
  status: 'OFFLINE' | 'ONLINE' | 'ON_DUTY';
  submittedAt: string;
  documents: { id: string; type: string; fileUrl: string; expiresAt: string | null }[];
}

/** Item order di overview admin (AdminService.ordersOverview). */
export interface AdminOrderItem {
  id: string;
  status: string;
  serviceName: string;
  customer: { id: string; name: string; phone: string };
  mitraName: string | null;
  customerPrice: number;
  finalPrice: number | null;
  createdAt: string;
}

export interface DecideVerificationResult {
  mitraId: string;
  verification: 'VERIFIED' | 'REJECTED';
  decidedBy: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export type VoucherBody = {
  code: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  minSpend?: number;
  maxDiscount?: number;
  walletOnly?: boolean;
  active?: boolean;
  validUntil: string; // ISO
};

export type BannerBody = {
  title: string;
  imageUrl: string;
  linkUrl?: string;
  active?: boolean;
};

export const ORDER_STATUSES = [
  'DRAFT',
  'BIDDING',
  'MATCHED',
  'MITRA_ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'SETTLED',
  'CANCELLED',
] as const;
