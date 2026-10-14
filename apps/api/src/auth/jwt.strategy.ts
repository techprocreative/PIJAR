import { User } from '@prisma/client';

/**
 * Tipe user terautentikasi pada handler controller.
 * Diisi oleh JwtAuthGuard global (common/guards) — objek User Prisma penuh.
 * Nama file dipertahankan (`jwt.strategy`) demi kompatibilitas import lintas modul.
 */
export type AuthUser = User;

/** Payload access token yang diterbitkan AuthService. */
export interface JwtPayload {
  sub: string; // userId
  phone: string;
  role: 'CUSTOMER' | 'MITRA' | 'ADMIN';
  type: 'access';
}
