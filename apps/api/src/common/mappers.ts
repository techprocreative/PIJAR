import { Payment, Service, User } from '@prisma/client';
import {
  BidDto,
  Gender,
  MitraProfileDto,
  MitraStatus,
  OrderDto,
  OrderStatus,
  PaymentDto,
  PaymentMethod,
  PaymentStatus,
  Role,
  ServiceDto,
  VerificationStatus,
} from '@pijar/shared';
import { BidWithRelations, OrderWithRelations } from './db-includes';

// Bentuk struktural MitraProfile yang dibutuhkan mapper
// (order.mitra membawa services; bid.mitra tidak).
interface MitraForDto {
  id: string;
  userId: string;
  gender: string;
  rating: number;
  totalJobs: number;
  status: string;
  verification: string;
  lastLat: number | null;
  lastLng: number | null;
  user: User;
  services?: { service: Service }[];
}


export function toServiceDto(s: Service): ServiceDto {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    durationMinutes: s.durationMinutes,
    basePrice: s.basePrice,
    imageUrl: s.imageUrl,
    active: s.active,
  };
}

export function toMitraProfileDto(m: MitraForDto): MitraProfileDto {
  return {
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    gender: m.gender as Gender,
    photoUrl: m.user.photoUrl,
    rating: m.rating,
    totalJobs: m.totalJobs,
    verification: m.verification as VerificationStatus,
    status: m.status as MitraStatus,
    lastLocation:
      m.lastLat != null && m.lastLng != null ? { lat: m.lastLat, lng: m.lastLng } : null,
    services: (m.services ?? []).map((sm) => toServiceDto(sm.service)),
  };
}

export function toBidDto(b: BidWithRelations): BidDto {
  return {
    id: b.id,
    orderId: b.orderId,
    mitraId: b.mitraId,
    mitra: {
      id: b.mitra.id,
      name: b.mitra.user.name,
      photoUrl: b.mitra.user.photoUrl,
      rating: b.mitra.rating,
      totalJobs: b.mitra.totalJobs,
    },
    price: b.price,
    etaMinutes: b.etaMinutes,
    distanceKm: b.distanceKm,
    createdAt: b.createdAt.toISOString(),
  };
}

export function toPaymentDto(p: Payment): PaymentDto {
  return {
    id: p.id,
    orderId: p.orderId ?? '',
    method: p.method as PaymentMethod,
    status: p.status as PaymentStatus,
    amount: p.amount,
    midtransSnapUrl: p.snapUrl,
    midtransRedirectUrl: null,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toOrderDto(o: OrderWithRelations): OrderDto {
  return {
    id: o.id,
    status: o.status as OrderStatus,
    service: toServiceDto(o.service),
    customer: { id: o.customer.id, name: o.customer.name, photoUrl: o.customer.photoUrl },
    address: {
      label: o.addressLabel,
      detail: o.addressDetail,
      location: { lat: o.lat, lng: o.lng },
    },
    scheduledAt: o.scheduledAt ? o.scheduledAt.toISOString() : null,
    customerPrice: o.customerPrice,
    finalPrice: o.finalPrice,
    matchedMitra: o.mitra ? toMitraProfileDto(o.mitra) : null,
    bids: o.bids.map(toBidDto),
    payment: o.payment ? toPaymentDto(o.payment) : null,
    createdAt: o.createdAt.toISOString(),
  };
}

