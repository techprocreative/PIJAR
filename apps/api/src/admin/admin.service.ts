import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletHelper } from '../wallet/wallet.helper';
import {
  AdminDashboardDto,
  DisputeDto,
  PromoBannerDto,
  Role,
  VoucherDto,
  WalletTransactionDto,
} from '@pijar/shared';

export interface VoucherBody {
  code: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  minSpend?: number;
  maxDiscount?: number;
  walletOnly?: boolean;
  active?: boolean;
  validUntil: string;
}

export interface BannerBody {
  title: string;
  imageUrl: string;
  linkUrl?: string;
  active?: boolean;
}

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

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'BIDDING',
  'MATCHED',
  'MITRA_ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
];

/**
 * Modul admin: dashboard, verifikasi mitra, dispute, wallet adjust manual
 * (pengganti payment gateway sementara), voucher, dan promo banner.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletHelper: WalletHelper,
  ) {}

  // ===== Dashboard =====

  async dashboard(): Promise<AdminDashboardDto> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayOrders, activeOrders, todayGmvAgg, pendingVerifications, openDisputes, onlineMitra] =
      await Promise.all([
        this.prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
        this.prisma.order.count({ where: { status: { in: ACTIVE_ORDER_STATUSES } } }),
        this.prisma.order.aggregate({
          where: {
            status: { in: ['COMPLETED', 'SETTLED'] as OrderStatus[] },
            updatedAt: { gte: startOfDay },
          },
          _sum: { finalPrice: true },
        }),
        this.prisma.mitraProfile.count({ where: { verification: 'PENDING' } }),
        this.prisma.dispute.count({ where: { status: 'OPEN' } }),
        this.prisma.mitraProfile.count({
          where: { status: { in: ['ONLINE', 'ON_DUTY'] } },
        }),
      ]);

    return {
      todayOrders,
      activeOrders,
      todayGmv: todayGmvAgg._sum.finalPrice ?? 0,
      pendingVerifications,
      openDisputes,
      onlineMitra,
    };
  }

  // ===== Verifikasi mitra =====

  async pendingVerifications(page: number, limit: number) {

    const [total, rows] = await Promise.all([
      this.prisma.mitraProfile.count({ where: { verification: 'PENDING' } }),
      this.prisma.mitraProfile.findMany({
        where: { verification: 'PENDING' },
        orderBy: { id: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, phone: true, createdAt: true } },
          documents: true,
        },
      }),
    ]);
    return {
      data: rows.map((m): PendingVerificationItem => ({
        mitraId: m.id,
        userId: m.user.id,
        name: m.user.name,
        phone: m.user.phone,
        gender: m.gender,
        status: m.status,
        submittedAt: m.user.createdAt.toISOString(),
        documents: m.documents.map((d) => ({
          id: d.id,
          type: d.type,
          fileUrl: d.fileUrl,
          expiresAt: d.expiresAt?.toISOString() ?? null,
        })),
      })),
      total,
      page,
      limit,
    };
  }

  async decideVerification(
    mitraId: string,
    decision: 'VERIFIED' | 'REJECTED',
    adminId: string,
    note?: string,
  ) {
    const mitra = await this.prisma.mitraProfile.findUnique({ where: { id: mitraId } });
    if (!mitra) throw new NotFoundException(`Mitra ${mitraId} tidak ditemukan`);
    if (mitra.verification !== 'PENDING') {
      throw new ConflictException(`Mitra sudah berstatus ${mitra.verification}`);
    }
    const updated = await this.prisma.mitraProfile.update({
      where: { id: mitraId },
      data: { verification: decision as VerificationStatus },
    });
    this.logger.log(`Admin ${adminId}: verifikasi mitra ${mitraId} → ${decision}${note ? ` (${note})` : ''}`);
    return { mitraId: updated.id, verification: updated.verification, decidedBy: adminId };
  }

  // ===== Dispute =====

  async disputes(status: 'OPEN' | 'RESOLVED' | undefined, page: number, limit: number) {
    const [total, rows] = await Promise.all([
      this.prisma.dispute.count({ where: status ? { status } : {} }),
      this.prisma.dispute.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { openedBy: { select: { role: true } }, order: { select: { id: true } } },
      }),
    ]);
    return {
      data: rows.map((d): DisputeDto => ({
        id: d.id,
        orderId: d.orderId,
        openedByRole: d.openedBy.role as Role,
        reason: d.reason,
        status: d.status as 'OPEN' | 'RESOLVED',
        resolution: d.resolution,
        createdAt: d.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  async resolveDispute(id: string, resolution: string, adminId: string): Promise<DisputeDto> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { openedBy: { select: { role: true } } },
    });
    if (!dispute) throw new NotFoundException(`Dispute ${id} tidak ditemukan`);
    if (dispute.status === 'RESOLVED') {
      throw new ConflictException('Dispute sudah selesai');
    }
    const updated = await this.prisma.dispute.update({
      where: { id },
      data: { status: 'RESOLVED', resolution },
    });
    this.logger.log(`Admin ${adminId}: dispute ${id} selesai — "${resolution}"`);
    return {
      id: updated.id,
      orderId: updated.orderId,
      openedByRole: dispute.openedBy.role as Role,
      reason: updated.reason,
      status: 'RESOLVED',
      resolution: updated.resolution,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  // ===== Wallet manual (pengganti gateway sementara) =====

  /** Topup/debet manual saldo user oleh admin — tercatat sebagai TOPUP di ledger wallet. */
  async adjustWallet(userId: string, amount: number, description: string): Promise<WalletTransactionDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException(`User ${userId} tidak ditemukan`);
    const txn = await this.walletHelper.credit({
      userId,
      amount,
      type: 'TOPUP',
      description: `[ADMIN] ${description}`,
    });
    return {
      id: txn.id,
      type: txn.type as WalletTransactionDto['type'],
      amount: txn.amount,
      balanceAfter: txn.balanceAfter,
      description: txn.description,
      createdAt: txn.createdAt.toISOString(),
    };
  }

  // ===== Voucher =====

  async createVoucher(body: VoucherBody): Promise<VoucherDto> {
    const code = body.code.trim().toUpperCase();
    const existing = await this.prisma.voucher.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`Kode voucher ${code} sudah dipakai`);
    this.validateVoucherValue(body.type, body.value);
    return this.toVoucherDto(await this.prisma.voucher.create({ data: this.voucherCreateData(body) }));
  }

  async bulkCreateVouchers(bodies: VoucherBody[]): Promise<VoucherDto[]> {
    const codes = bodies.map((b) => b.code.trim().toUpperCase());
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException('Ada kode voucher duplikat dalam batch');
    }
    const existing = await this.prisma.voucher.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    if (existing.length > 0) {
      throw new ConflictException(`Kode sudah dipakai: ${existing.map((v) => v.code).join(', ')}`);
    }
    for (const body of bodies) {
      this.validateVoucherValue(body.type, body.value);
    }
    const created = await this.prisma.$transaction(
      bodies.map((body) => this.prisma.voucher.create({ data: this.voucherCreateData(body) })),
    );
    return created.map((v) => this.toVoucherDto(v));
  }

  async listVouchers(page: number, limit: number) {
    const [total, rows] = await Promise.all([
      this.prisma.voucher.count(),
      this.prisma.voucher.findMany({
        orderBy: { validUntil: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data: rows.map((v) => this.toVoucherDto(v)), total, page, limit };
  }

  async updateVoucher(id: string, body: VoucherBody): Promise<VoucherDto> {
    const existing = await this.prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Voucher ${id} tidak ditemukan`);
    const code = body.code.trim().toUpperCase();
    if (code !== existing.code) {
      const dup = await this.prisma.voucher.findUnique({ where: { code } });
      if (dup) throw new ConflictException(`Kode voucher ${code} sudah dipakai`);
    }
    this.validateVoucherValue(body.type, body.value);
    const updated = await this.prisma.voucher.update({
      where: { id },
      data: this.voucherUpdateData(body),
    });
    return this.toVoucherDto(updated);
  }

  private validateVoucherValue(type: 'PERCENT' | 'AMOUNT', value: number): void {
    if (type === 'PERCENT' && (value < 1 || value > 100)) {
      throw new BadRequestException('Voucher PERCENT: value harus 1..100');
    }
  }

  private voucherCreateData(body: VoucherBody): Prisma.VoucherUncheckedCreateInput {
    return {
      code: body.code.trim().toUpperCase(),
      type: body.type,
      value: body.value,
      minSpend: body.minSpend ?? 0,
      maxDiscount: body.maxDiscount ?? null,
      walletOnly: body.walletOnly ?? false,
      active: body.active ?? true,
      validUntil: new Date(body.validUntil),
    };
  }

  private voucherUpdateData(body: VoucherBody): Prisma.VoucherUncheckedUpdateInput {
    return {
      code: body.code.trim().toUpperCase(),
      type: body.type,
      value: body.value,
      minSpend: body.minSpend ?? 0,
      maxDiscount: body.maxDiscount ?? null,
      walletOnly: body.walletOnly ?? false,
      active: body.active ?? true,
      validUntil: new Date(body.validUntil),
    };
  }

  private toVoucherDto(v: {
    id: string;
    code: string;
    type: string;
    value: number;
    minSpend: number;
    maxDiscount: number | null;
    walletOnly: boolean;
    active: boolean;
    validUntil: Date;
  }): VoucherDto {
    return {
      id: v.id,
      code: v.code,
      type: v.type as 'PERCENT' | 'AMOUNT',
      value: v.value,
      minSpend: v.minSpend,
      maxDiscount: v.maxDiscount,
      walletOnly: v.walletOnly,
      active: v.active,
      validUntil: v.validUntil.toISOString(),
    };
  }

  // ===== Promo banner =====

  async createBanner(body: BannerBody): Promise<PromoBannerDto> {
    return this.toBannerDto(
      await this.prisma.promoBanner.create({
        data: {
          title: body.title.trim(),
          imageUrl: body.imageUrl,
          linkUrl: body.linkUrl ?? null,
          active: body.active ?? true,
        },
      }),
    );
  }

  async listBanners(page: number, limit: number) {
    const [total, rows] = await Promise.all([
      this.prisma.promoBanner.count(),
      this.prisma.promoBanner.findMany({
        orderBy: { id: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data: rows.map((b) => this.toBannerDto(b)), total, page, limit };
  }

  async updateBanner(id: string, body: BannerBody): Promise<PromoBannerDto> {
    const existing = await this.prisma.promoBanner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Banner ${id} tidak ditemukan`);
    return this.toBannerDto(
      await this.prisma.promoBanner.update({
        where: { id },
        data: {
          title: body.title.trim(),
          imageUrl: body.imageUrl,
          linkUrl: body.linkUrl ?? null,
          active: body.active ?? true,
        },
      }),
    );
  }

  private toBannerDto(b: {
    id: string;
    title: string;
    imageUrl: string;
    linkUrl: string | null;
    active: boolean;
  }): PromoBannerDto {
    return {
      id: b.id,
      title: b.title,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl,
      active: b.active,
    };
  }

  // ===== Orders overview =====

  async ordersOverview(status: string | undefined, page: number, limit: number) {
    const where: Prisma.OrderWhereInput = {};
    if (status) {
      const statuses = Object.values(OrderStatus) as string[];
      if (!statuses.includes(status)) {
        throw new BadRequestException(`Status tidak valid. Pilihan: ${statuses.join(', ')}`);
      }
      where.status = status as OrderStatus;
    }
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          status: true,
          customerPrice: true,
          finalPrice: true,
          createdAt: true,
          customer: { select: { id: true, name: true, phone: true } },
          mitra: { select: { id: true, user: { select: { name: true } } } },
          service: { select: { name: true } },
        },
      }),
    ]);
    return {
      data: rows.map((o) => ({
        id: o.id,
        status: o.status,
        serviceName: o.service.name,
        customer: o.customer,
        mitraName: o.mitra?.user.name ?? null,
        customerPrice: o.customerPrice,
        finalPrice: o.finalPrice,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }
}
