import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BidDto } from '@pijar/shared';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { bidInclude } from '../common/db-includes';
import { toBidDto } from '../common/mappers';
import { haversineKm } from '../common/geo';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PlaceBidBody } from './dto/place-bid.dto';

@Injectable()
export class BidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async listByOrder(user: User, orderId: string): Promise<BidDto[]> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (user.role !== 'ADMIN' && order.customerId !== user.id && user.role !== 'MITRA') {
      throw new ForbiddenException('Tidak berhak mengakses bid order ini');
    }
    const rows = await this.prisma.bid.findMany({
      where: { orderId, ...(user.role === 'MITRA' ? { mitra: { userId: user.id } } : {}) },
      include: bidInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toBidDto);
  }

  /**
   * Mitra melakukan bid pada order BIDDING.
   * - price = customerPrice  → "accept langsung" (bid harga sama)
   * - price lainnya          → counter-bid
   * Satu bid aktif per mitra per order (unique constraint); bid lama di-update.
   */
  async placeBid(userId: string, orderId: string, dto: PlaceBidBody): Promise<BidDto> {
    if (!Number.isInteger(dto.price) || dto.price <= 0 || dto.price > 2_147_483_647 ||
      !Number.isInteger(dto.etaMinutes) || dto.etaMinutes < 1 || dto.etaMinutes > 600) {
      throw new BadRequestException('Harga atau ETA bid tidak valid');
    }
    const { bid, customerId } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Order tidak ditemukan');
      if (order.status !== 'BIDDING') throw new BadRequestException('Order tidak dalam fase bidding');
      if (order.customerId === userId) throw new ForbiddenException('Tidak bisa bid order sendiri');
      await tx.$queryRaw`SELECT id FROM "MitraProfile" WHERE "userId" = ${userId} FOR UPDATE`;
      const mitra = await tx.mitraProfile.findUnique({ where: { userId }, include: { services: true } });
      if (!mitra || mitra.verification !== 'VERIFIED' || mitra.status !== 'ONLINE') {
        throw new ForbiddenException('Mitra harus terverifikasi dan ONLINE');
      }
      if (order.genderPreference && order.genderPreference !== mitra.gender) {
        throw new ForbiddenException('Gender mitra tidak sesuai preferensi customer');
      }
      if (!mitra.services.some((service) => service.serviceId === order.serviceId)) {
        throw new ForbiddenException('Mitra tidak menawarkan layanan ini');
      }
      if (dto.price < Math.floor(order.customerPrice * 0.5) || dto.price > order.customerPrice * 3) {
        throw new BadRequestException('Counter-bid harus 50% hingga 3x tawaran customer');
      }
      if (mitra.lastLat == null || mitra.lastLng == null) {
        throw new BadRequestException('Lokasi mitra belum tersedia');
      }
      const distanceKm = haversineKm(
        { lat: mitra.lastLat, lng: mitra.lastLng }, { lat: order.lat, lng: order.lng },
      );
      if (!Number.isFinite(distanceKm) || distanceKm > 15) {
        throw new BadRequestException('Jarak mitra ke lokasi customer > 15 km');
      }
      const bid = await tx.bid.upsert({
        where: { orderId_mitraId: { orderId, mitraId: mitra.id } },
        update: { price: dto.price, etaMinutes: dto.etaMinutes, distanceKm, status: 'PENDING' },
        create: { orderId, mitraId: mitra.id, price: dto.price, etaMinutes: dto.etaMinutes, distanceKm },
        include: bidInclude,
      });
      return { bid, customerId: order.customerId };
    });
    const dtoBid = toBidDto(bid);
    this.realtime.emitToUser(customerId, { event: 'order:bid', data: dtoBid });
    return dtoBid;
  }
}
