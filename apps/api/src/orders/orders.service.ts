import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, User, WalletTransaction } from '@prisma/client';
import { OrderDto } from '@pijar/shared';
import { PrismaService } from '../prisma/prisma.service';
import { orderInclude, OrderWithRelations } from '../common/db-includes';
import { toOrderDto } from '../common/mappers';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WalletHelper } from '../wallet/wallet.helper';
import { SettlementService } from '../settlement/settlement.service';
import { CreateOrderDto } from './dto/create-order.dto';
// Transisi legal state machine order (lihat ARCHITECTURE.md)
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
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

// Status yang boleh dipicu mitra via endpoint transisi
const MITRA_TRANSITIONS = new Set<OrderStatus>([
  'MITRA_ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
]);

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly walletHelper: WalletHelper,
    private readonly settlement: SettlementService,
  ) {}

  // ===== Create =====

  async createOrder(customerId: string, dto: CreateOrderDto): Promise<OrderDto> {
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, active: true },
    });
    if (!service) throw new NotFoundException('Layanan tidak ditemukan / tidak aktif');

    let scheduledAt: Date | null = null;
    if (dto.scheduledAt) {
      const parsed = new Date(dto.scheduledAt);
      if (Number.isNaN(parsed.getTime())) throw new BadRequestException('scheduledAt tidak valid');
      if (parsed.getTime() < Date.now() - 60_000) {
        throw new BadRequestException('scheduledAt tidak boleh di masa lalu');
      }
      scheduledAt = parsed;
    }

    // Validasi sederhana: tawaran customer tidak kurang dari 50% harga dasar (anti lowball)
    if (dto.customerPrice < Math.floor(service.basePrice * 0.5)) {
      throw new BadRequestException(
        'Tawaran terlalu rendah (minimum 50% harga layanan); naikkan tawaran atau gunakan harga normal',
      );
    }

    const order = await this.prisma.order.create({
      data: {
        customerId,
        serviceId: dto.serviceId,
        status: 'BIDDING',
        addressLabel: dto.addressLabel,
        addressDetail: dto.addressDetail,
        lat: dto.location.lat,
        lng: dto.location.lng,
        scheduledAt,
        customerPrice: dto.customerPrice,
        notes: dto.notes,
        genderPreference: dto.therapistGenderPreference ?? null,
      },
      include: orderInclude,
    });

    // Broadcast realtime ke mitra online (radius bertingkat di gateway)
    this.realtime
      .broadcastNewOrder(order.id)
      .catch((err) => this.logger.error(`Broadcast order gagal: ${String(err)}`));

    return toOrderDto(order);
  }

  // ===== Read =====

  async listMine(user: User): Promise<OrderDto[]> {
    const where: Prisma.OrderWhereInput = user.role === 'ADMIN' ? {} :
      user.role === 'MITRA' ? { mitra: { userId: user.id } } : { customerId: user.id };
    const rows = await this.prisma.order.findMany({
      where, include: orderInclude, orderBy: { createdAt: 'desc' },
    });
    return rows.map((order) => this.orderDtoForUser(order, user));
  }

  async getOrder(user: User, orderId: string): Promise<OrderDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (user.role !== 'ADMIN' && order.customerId !== user.id &&
      !(user.role === 'MITRA' && (order.mitra?.userId === user.id ||
        order.bids.some((bid) => bid.mitra.userId === user.id)))) {
      throw new ForbiddenException('Tidak berhak mengakses order ini');
    }
    return this.orderDtoForUser(order, user);
  }

  private orderDtoForUser(order: OrderWithRelations, user: User): OrderDto {
    return toOrderDto(user.role === 'MITRA' ? {
      ...order, bids: order.bids.filter((bid) => bid.mitra.userId === user.id),
    } : order);
  }

  // ===== Bidding =====

  /** Order → mitra → wallet locks serialize acceptance with bids, cancellation, and other assignments. */
  async acceptBid(userId: string, orderId: string, bidId: string): Promise<OrderDto> {
    const { updated, charge } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Order tidak ditemukan');
      if (order.customerId !== userId) throw new ForbiddenException('Bukan order milik customer ini');
      if (order.status !== 'BIDDING') throw new BadRequestException('Order tidak dalam fase bidding');
      if (typeof bidId !== 'string' || !bidId) throw new BadRequestException('bidId wajib diisi');
      const bid = await tx.bid.findFirst({ where: { id: bidId, orderId } });
      if (!bid) throw new NotFoundException('Bid tidak ditemukan');
      if (bid.status !== 'PENDING') throw new ConflictException('Bid sudah tidak tersedia');
      await tx.$queryRaw`SELECT id FROM "MitraProfile" WHERE id = ${bid.mitraId} FOR UPDATE`;
      const mitra = await tx.mitraProfile.findUnique({ where: { id: bid.mitraId }, include: { services: true } });
      if (!mitra || mitra.userId === userId || mitra.verification !== 'VERIFIED' || mitra.status !== 'ONLINE' ||
        (order.genderPreference && order.genderPreference !== mitra.gender) ||
        !mitra.services.some((service) => service.serviceId === order.serviceId)) {
        throw new ConflictException('Mitra tidak tersedia untuk order ini');
      }
      const assignment = await tx.order.findFirst({
        where: { mitraId: mitra.id, status: { notIn: ['DRAFT', 'BIDDING', 'SETTLED', 'CANCELLED'] } },
        select: { id: true },
      });
      if (assignment) throw new ConflictException('Mitra sedang mengerjakan order lain');
      const charge = await this.walletHelper.chargeOrderToWallet(order.customerId, bid.price, orderId, tx);
      await tx.bid.update({ where: { id: bid.id }, data: { status: 'ACCEPTED' } });
      await tx.bid.updateMany({
        where: { orderId, id: { not: bid.id }, status: 'PENDING' }, data: { status: 'REJECTED' },
      });
      await tx.mitraProfile.update({ where: { id: mitra.id }, data: { status: 'ON_DUTY' } });
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'MATCHED', mitraId: bid.mitraId, finalPrice: bid.price },
        include: orderInclude,
      });
      return { updated, charge };
    });
    // Order rooms include the assigned mitra: never publish competitors' bids there.
    this.realtime.emitToOrder(orderId, { event: 'order:matched', data: toOrderDto({ ...updated, bids: [] }) });
    this.realtime.emitToUser(updated.customerId, { event: 'order:matched', data: toOrderDto(updated) });
    this.realtime.emitToUser(updated.mitra!.userId, {
      event: 'order:matched',
      data: toOrderDto({ ...updated, bids: updated.bids.filter((bid) => bid.mitraId === updated.mitraId) }),
    });
    this.realtime.emitToUser(charge.userId, {
      event: 'wallet:updated', data: { balance: charge.balanceAfter, currency: 'IDR' },
    });
    return toOrderDto(updated);
  }

  // ===== Status transitions =====

  async transitionStatus(user: User, orderId: string, next: OrderStatus): Promise<OrderDto> {
    if (!MITRA_TRANSITIONS.has(next)) throw new BadRequestException(`Transisi ke ${next} tidak didukung endpoint ini`);
    const { updated, earning, changed } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
      if (!order) throw new NotFoundException('Order tidak ditemukan');
      if (user.role !== 'ADMIN' && (user.role !== 'MITRA' || order.mitra?.userId !== user.id)) {
        throw new ForbiddenException('Hanya mitra matched yang boleh mengubah status');
      }
      if ((order.status === next && next !== 'COMPLETED') || (next === 'COMPLETED' && order.status === 'SETTLED')) {
        return { updated: order, earning: null, changed: false };
      }
      if (!(next === 'COMPLETED' && order.status === 'COMPLETED') && !ALLOWED_TRANSITIONS[order.status].includes(next)) {
        throw new BadRequestException(`Transisi ${order.status} → ${next} tidak legal`);
      }
      await tx.order.update({ where: { id: orderId }, data: { status: next } });
      const earning = next === 'COMPLETED' ? await this.settlement.settleOrder(orderId, tx) : null;
      const updated = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
      return { updated, earning, changed: true };
    });
    if (changed) {
      this.realtime.emitToOrder(orderId, {
        event: 'order:status', data: { orderId, status: updated.status, at: new Date().toISOString() },
      });
    }
    if (earning) this.realtime.emitToUser(earning.userId, {
      event: 'wallet:updated', data: { balance: earning.balanceAfter, currency: 'IDR' },
    });
    return this.orderDtoForUser(updated, user);
  }

  // ===== Cancel =====

  async cancelOrder(user: User, orderId: string, reason: string): Promise<OrderDto> {
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) {
      throw new BadRequestException('Alasan pembatalan wajib (3–500 karakter)');
    }
    const { updated, refund, changed } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
      if (!order) throw new NotFoundException('Order tidak ditemukan');
      if (user.role !== 'ADMIN' && order.customerId !== user.id &&
        !(user.role === 'MITRA' && order.mitra?.userId === user.id)) {
        throw new ForbiddenException('Tidak berhak membatalkan order ini');
      }
      if (order.status === 'CANCELLED') return { updated: order, refund: null, changed: false };
      if (!ALLOWED_TRANSITIONS[order.status].includes('CANCELLED')) {
        throw new BadRequestException(`Order ${order.status} tidak bisa dibatalkan`);
      }
      let refund: WalletTransaction | null = null;
      if (order.mitraId) {
        await tx.$queryRaw`SELECT id FROM "MitraProfile" WHERE id = ${order.mitraId} FOR UPDATE`;
        const mitra = await tx.mitraProfile.findUniqueOrThrow({ where: { id: order.mitraId } });
        const payment = await this.walletHelper.requirePaidOrder(order, tx);
        const earning = await tx.walletTransaction.findFirst({
          where: { userId: mitra.userId, type: 'ORDER_EARNING', description: { startsWith: `Order earning (${orderId}), fee ` } },
        });
        if (earning) throw new ConflictException('Order telah memiliki earning; pembatalan ditolak');
        refund = await this.walletHelper.credit({
          userId: order.customerId, amount: payment.amount, type: 'REFUND', description: `Order refund (${orderId})`, tx,
        });
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
        await tx.mitraProfile.update({
          where: { id: mitra.id }, data: { status: mitra.verification === 'VERIFIED' ? 'ONLINE' : 'OFFLINE' },
        });
      } else {
        const debit = await tx.walletTransaction.findFirst({
          where: { userId: order.customerId, type: 'ORDER_PAYMENT', description: `Order payment (${orderId})` },
        });
        if (order.payment || debit) throw new ConflictException('Escrow order tidak konsisten; pembatalan ditolak');
      }
      await tx.bid.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'REJECTED' } });
      const updated = await tx.order.update({
        where: { id: orderId }, data: { status: 'CANCELLED', cancelReason: reason.trim() }, include: orderInclude,
      });
      return { updated, refund, changed: true };
    });
    if (changed) this.realtime.emitToOrder(orderId, {
      event: 'order:cancelled', data: { orderId, reason: reason.trim() },
    });
    if (refund) this.realtime.emitToUser(refund.userId, {
      event: 'wallet:updated', data: { balance: refund.balanceAfter, currency: 'IDR' },
    });
    return this.orderDtoForUser(updated, user);
  }
}

