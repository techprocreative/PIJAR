// Klien endpoint admin: /v1/admin/* (AdminController di apps/api).
// Semua fungsi memakai authorizedJson (auto refresh 401).

import type {
  AdminDashboardDto,
  AdminOrderItem,
  BannerBody,
  DecideVerificationResult,
  Paginated,
  PendingVerificationItem,
  VoucherBody,
} from '../types';
import type { DisputeDto, PromoBannerDto, VoucherDto, WalletTransactionDto } from '@pijar/shared';
import { authorizedJson } from './authorized';
import { DEFAULT_PAGE_SIZE } from '../constants';

const BASE = '/v1/admin';

export async function getDashboard(): Promise<AdminDashboardDto> {
  return authorizedJson<AdminDashboardDto>(`${BASE}/dashboard`);
}

// --- Verifikasi mitra ---

export async function getPendingVerifications(page = 1, limit = DEFAULT_PAGE_SIZE) {
  return authorizedJson<Paginated<PendingVerificationItem>>(
    `${BASE}/mitra/verifications?page=${page}&limit=${limit}`,
  );
}

export async function decideVerification(
  mitraId: string,
  decision: 'VERIFIED' | 'REJECTED',
  note?: string,
): Promise<DecideVerificationResult> {
  return authorizedJson<DecideVerificationResult>(`${BASE}/mitra/verifications/${mitraId}`, {
    method: 'POST',
    body: JSON.stringify({ decision, note }),
  });
}

// --- Dispute ---

export async function getDisputes(
  params: { status?: 'OPEN' | 'RESOLVED'; page?: number; limit?: number } = {},
): Promise<Paginated<DisputeDto>> {
  const q = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? DEFAULT_PAGE_SIZE),
  });
  if (params.status) q.set('status', params.status);
  return authorizedJson<Paginated<DisputeDto>>(`${BASE}/disputes?${q}`);
}

export async function resolveDispute(id: string, resolution: string): Promise<DisputeDto> {
  return authorizedJson<DisputeDto>(`${BASE}/disputes/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolution }),
  });
}

// --- Wallet manual ---

export async function adjustWallet(
  userId: string,
  amount: number,
  description: string,
): Promise<WalletTransactionDto> {
  return authorizedJson<WalletTransactionDto>(`${BASE}/wallet/adjust`, {
    method: 'POST',
    body: JSON.stringify({ userId, amount, description }),
  });
}

// --- Voucher ---

export async function getVouchers(page = 1, limit = DEFAULT_PAGE_SIZE) {
  return authorizedJson<Paginated<VoucherDto>>(`${BASE}/vouchers?page=${page}&limit=${limit}`);
}

export async function createVoucher(body: VoucherBody): Promise<VoucherDto> {
  return authorizedJson<VoucherDto>(`${BASE}/vouchers`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function bulkCreateVouchers(bodies: VoucherBody[]): Promise<VoucherDto[]> {
  return authorizedJson<VoucherDto[]>(`${BASE}/vouchers/bulk`, {
    method: 'POST',
    body: JSON.stringify({ vouchers: bodies }),
  });
}

export async function updateVoucher(id: string, body: VoucherBody): Promise<VoucherDto> {
  return authorizedJson<VoucherDto>(`${BASE}/vouchers/${id}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// --- Promo banner ---

export async function getBanners(page = 1, limit = DEFAULT_PAGE_SIZE) {
  return authorizedJson<Paginated<PromoBannerDto>>(`${BASE}/banners?page=${page}&limit=${limit}`);
}

export async function createBanner(body: BannerBody): Promise<PromoBannerDto> {
  return authorizedJson<PromoBannerDto>(`${BASE}/banners`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateBanner(id: string, body: BannerBody): Promise<PromoBannerDto> {
  return authorizedJson<PromoBannerDto>(`${BASE}/banners/${id}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// --- Orders overview ---

export async function getOrdersOverview(
  params: { status?: string; page?: number; limit?: number } = {},
): Promise<Paginated<AdminOrderItem>> {
  const q = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? DEFAULT_PAGE_SIZE),
  });
  if (params.status) q.set('status', params.status);
  return authorizedJson<Paginated<AdminOrderItem>>(`${BASE}/orders?${q}`);
}
