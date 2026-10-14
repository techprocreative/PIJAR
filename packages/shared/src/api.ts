// ===== Kontrak API & tipe bersama PIJAR =====
// Dipakai oleh: apps/api (NestJS), apps/customer, apps/mitra, apps/admin

export type Role = 'CUSTOMER' | 'MITRA' | 'ADMIN';

export type OrderStatus =
  | 'DRAFT'
  | 'BIDDING'
  | 'MATCHED'
  | 'MITRA_ON_THE_WAY'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SETTLED'
  | 'CANCELLED';

export type Gender = 'MALE' | 'FEMALE';
export type MitraStatus = 'OFFLINE' | 'ONLINE' | 'ON_DUTY';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
export type PaymentMethod = 'WALLET' | 'MIDTRANS_VA' | 'MIDTRANS_QRIS' | 'MIDTRANS_EWALLET' | 'MIDTRANS_CARD';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

// ===== Auth =====

export interface OtpRequestDto { phone: string; }
export interface OtpVerifyDto { phone: string; code: string; role: Role; name?: string; }
export interface AuthTokensDto { accessToken: string; refreshToken: string; user: UserDto; }
export interface RefreshDto { refreshToken: string; }

export interface UserDto {
  id: string;
  phone: string;
  name: string;
  role: Role;
  photoUrl?: string | null;
  walletBalance?: number; // customer & mitra
}

// ===== Layanan =====

export interface ServiceDto {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  basePrice: number;
  imageUrl?: string | null;
  active: boolean;
}

// ===== Mitra =====

export interface MitraProfileDto {
  id: string;
  userId: string;
  name: string;
  gender: Gender;
  photoUrl?: string | null;
  rating: number;
  totalJobs: number;
  verification: VerificationStatus;
  status: MitraStatus;
  lastLocation?: GeoPoint | null;
  services: ServiceDto[];
}

export interface MitraLocationUpdateDto {
  lat: number;
  lng: number;
  heading?: number;
  accuracyM?: number;
  orderId?: string; // saat on-duty, untuk room tracking
}

// ===== Order & Bidding =====

export interface CreateOrderDto {
  serviceId: string;
  addressLabel: string;
  addressDetail: string;
  location: GeoPoint;
  scheduledAt?: string | null; // ISO; null = sekarang
  customerPrice: number; // tawaran awal customer (bidding)
  therapistGenderPreference?: Gender | null;
  notes?: string;
}

export interface BidDto {
  id: string;
  orderId: string;
  mitraId: string;
  mitra: Pick<MitraProfileDto, 'id' | 'name' | 'photoUrl' | 'rating' | 'totalJobs'>;
  price: number; // counter-bid mitra (atau = customerPrice bila accept langsung)
  etaMinutes: number;
  distanceKm: number;
  createdAt: string;
}

export interface OrderDto {
  id: string;
  status: OrderStatus;
  service: ServiceDto;
  customer: Pick<UserDto, 'id' | 'name' | 'photoUrl'>;
  address: { label: string; detail: string; location: GeoPoint };
  scheduledAt: string | null;
  customerPrice: number;
  finalPrice?: number | null;
  matchedMitra?: MitraProfileDto | null;
  bids: BidDto[];
  payment?: PaymentDto | null;
  createdAt: string;
}

export interface AcceptBidDto { bidId: string; }
export interface PlaceBidDto { orderId: string; price: number; etaMinutes: number; }
export interface CancelOrderDto { reason: string; }

// ===== Payment =====

export interface PaymentDto {
  id: string;
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  midtransSnapUrl?: string | null;
  midtransRedirectUrl?: string | null;
  createdAt: string;
}

export interface TopUpDto { amount: number; method: Exclude<PaymentMethod, 'WALLET'>; }
export interface WalletDto { balance: number; currency: 'IDR'; }

export interface WalletTransactionDto {
  id: string;
  type: 'TOPUP' | 'ORDER_PAYMENT' | 'ORDER_EARNING' | 'REFUND' | 'WITHDRAWAL';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

// ===== Rating =====

export interface RateDto {
  orderId: string;
  stars: number; // 1..5
  comment?: string;
  toRole: Role; // CUSTOMER menilai MITRA atau sebaliknya
}

// ===== Events WebSocket (server -> client) =====

// Room: `order:{orderId}` (customer + mitra matched + admin)
// Room: `mitra:orders` (semua mitra online — broadcast order baru)
// Room: `admin` (dashboard)

export type ServerEvent =
  | { event: 'order:new'; data: OrderDto }                      // → mitra:orders
  | { event: 'order:bid'; data: BidDto }                        // → user:{customerId}
  | { event: 'order:matched'; data: OrderDto }                  // → order:{id}
  | { event: 'order:status'; data: { orderId: string; status: OrderStatus; at: string } }
  | { event: 'order:cancelled'; data: { orderId: string; reason: string } }
  | { event: 'tracking:location'; data: { orderId: string; mitraId: string; location: GeoPoint; heading?: number; at: string } }
  | { event: 'mitra:status'; data: { mitraId: string; status: MitraStatus } }
  | { event: 'wallet:updated'; data: WalletDto };

// Client -> server
export type ClientEvent =
  | { event: 'mitra:location'; data: MitraLocationUpdateDto }
  | { event: 'mitra:listen_orders'; data: { lat: number; lng: number } } // join broadcast room
  | { event: 'mitra:stop_orders'; data: Record<string, never> }
  | { event: 'order:join'; data: { orderId: string } };

// ===== Admin =====

export interface AdminDashboardDto {
  todayOrders: number;
  activeOrders: number;
  todayGmv: number;
  pendingVerifications: number;
  openDisputes: number;
  onlineMitra: number;
}

export interface DisputeDto {
  id: string;
  orderId: string;
  openedByRole: Role;
  reason: string;
  status: 'OPEN' | 'RESOLVED';
  resolution?: string | null;
  createdAt: string;
}

export interface VoucherDto {
  id: string;
  code: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  minSpend: number;
  maxDiscount?: number | null;
  walletOnly: boolean;
  active: boolean;
  validUntil: string;
}

export interface PromoBannerDto {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string | null;
  active: boolean;
}
