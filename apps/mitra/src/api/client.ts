/**
 * HTTP client untuk REST API PIJAR (v1).
 *
 * Catatan kontrak backend:
 * - Prefix global `v1` (main.ts setGlobalPrefix('v1')).
 * - Token access 15 menit → refresh otomatis dengan rotasi (refresh lama dicabut).
 * - Rekor refresh token replay → server menghapus sesi → logout paksa.
 */
import type {
  AuthTokensDto,
  BidDto,
  OrderDto,
  OrderStatus,
  RefreshDto,
  WalletDto,
  WalletTransactionDto,
} from '@pijar/shared';
import { API_URL } from '../config/env';
import { saveSession } from './storage';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface TxnPage {
  data: WalletTransactionDto[];
  total: number;
  page: number;
  limit: number;
}

/** Token access in-memory (di-set oleh auth store saat login/refresh). */
let accessToken: string | null = null;
let refreshToken: string | null = null;
let onTokensChanged: ((tokens: AuthTokensDto) => void) | null = null;

export function observeTokenRefresh(listener: (tokens: AuthTokensDto) => void): void {
  onTokensChanged = listener;
}

export function getAccessToken(): string | null { return accessToken; }

export function setTokens(tokens: { accessToken: string; refreshToken: string } | null): void {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

/** Panggilan mentah tanpa refresh (dipakai oleh auth itu sendiri). */
async function rawRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  auth?: string | null,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = auth === undefined ? accessToken : auth;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(0, `Tidak bisa terhubung ke server (${String(err)})`);
  }


  const text = await res.text();
  const data: unknown = text ? safeJson(text) : null;
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    if (
      data !== null &&
      typeof data === 'object' &&
      'message' in data &&
      typeof data.message === 'string' &&
      data.message.length > 0
    ) {
      message = data.message;
    }
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

let refreshInFlight: Promise<boolean> | null = null;
/** Refresh token dengan single-flight; return true bila berhasil. */
export async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  if (refreshInFlight) return refreshInFlight;
  const original = refreshToken;
  refreshInFlight = (async () => {
    try {
      const dto: RefreshDto = { refreshToken: original };
      const tokens = await rawRequest<AuthTokensDto>('POST', '/v1/auth/refresh', dto, null);
      if (refreshToken !== original) return false;
      setTokens(tokens);
      onTokensChanged?.(tokens);
      await saveSession(tokens);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Request dengan auto-refresh token 401 (satu kali retry). */
export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!accessToken) throw new ApiError(401, 'Belum login');
  const requestedToken = accessToken;
  try {
    return await rawRequest<T>(method, path, body);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const ok = accessToken != null && (accessToken !== requestedToken || await tryRefresh());
      if (ok) return rawRequest<T>(method, path, body);
    }
    throw err;
  }
}

// ===== Endpoint publik (auth) =====

export async function requestOtp(phone: string): Promise<{ ok: true; devCode?: string }> {
  return rawRequest('POST', '/v1/auth/otp/request', { phone }, null);
}

export async function verifyOtp(
  phone: string,
  code: string,
  role: 'MITRA',
  name?: string,
): Promise<AuthTokensDto> {
  return rawRequest('POST', '/v1/auth/otp/verify', { phone, code, role, name }, null);
}

// ===== Endpoint terautentikasi (mitra) =====

/** Layanan aktif — dipakai untuk memvalidasi bid lokal sebelum kirim. */
export function listServices() {
  return api<{ id: string; name: string; basePrice: number }[]>('GET', '/v1/services');
}

/** Tempatkan bid (accept langsung = price customerPrice; counter-bid = harga lain). */
export function placeBid(orderId: string, price: number, etaMinutes: number): Promise<BidDto> {
  return api<BidDto>('POST', `/v1/orders/${orderId}/bids`, { price, etaMinutes });
}

export function getOrder(orderId: string): Promise<OrderDto> {
  return api<OrderDto>('GET', `/v1/orders/${orderId}`);
}

export function listMyOrders(): Promise<OrderDto[]> {
  return api<OrderDto[]>('GET', '/v1/orders/mine');
}

/** Transisi status oleh mitra: on_the_way → arrived → in_progress → completed. */
export function transitionStatus(orderId: string, status: OrderStatus): Promise<OrderDto> {
  return api<OrderDto>('POST', `/v1/orders/${orderId}/status`, { status });
}

/** Batalkan order dari sisi mitra (mis. customer tidak di lokasi). */
export function cancelOrder(orderId: string, reason: string): Promise<OrderDto> {
  return api<OrderDto>('POST', `/v1/orders/${orderId}/cancel`, { reason });
}

/** Rating mitra → customer setelah order selesai. */
export function rateCustomer(
  orderId: string,
  stars: number,
  comment?: string,
): Promise<unknown> {
  return api('POST', '/v1/ratings', { orderId, stars, comment, toRole: 'CUSTOMER' });
}

// ===== Wallet =====

export function getWallet(): Promise<WalletDto> {
  return api<WalletDto>('GET', '/v1/wallet');
}

export function listWalletTransactions(page = 1, limit = 20): Promise<TxnPage> {
  return api<TxnPage>('GET', `/v1/wallet/transactions?page=${page}&limit=${limit}`);
}

