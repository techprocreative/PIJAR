import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@pijar/shared';

export interface RatingAggregates {
  rating: number;
  ratingCount: number;
}

/**
 * Rating dua arah: customer menilai mitra, mitra menilai customer.
 * Hanya untuk order milik keduanya dan sudah COMPLETED/SETTLED.
 * Rata-rata mitra di-recompute atomic (agregat ulang dari tabel Rating).
 */
@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Simpan rating; recompute rata-rata + counter ratee (mitra). */
  async submitRating(raterId: string, orderId: string, stars: number, toRole: Role, comment?: string) {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new BadRequestException('stars harus bilangan bulat 1..5');
    }
    if (toRole !== 'MITRA' && toRole !== 'CUSTOMER') {
      throw new BadRequestException('toRole harus MITRA atau CUSTOMER');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          customerId: true,
          mitraId: true,
          mitra: { select: { id: true, userId: true } },
        },
      });
      if (!order) throw new NotFoundException(`Order ${orderId} tidak ditemukan`);
      if (order.status !== 'COMPLETED' && order.status !== 'SETTLED') {
        throw new ConflictException('Rating hanya bisa diberikan setelah order selesai');
      }
      if (!order.mitraId || !order.mitra) {
        throw new ConflictException('Order tidak punya mitra — tidak ada yang bisa dinilai');
      }

      const isCustomerRater = order.customerId === raterId;
      const isMitraRater = order.mitra.userId === raterId;
      if (!isCustomerRater && !isMitraRater) {
        throw new ForbiddenException('Anda bukan peserta order ini');
      }

      let rateeId: string;
      if (isCustomerRater) {
        if (toRole !== 'MITRA') {
          throw new BadRequestException('Customer hanya bisa menilai MITRA pada order ini');
        }
        rateeId = order.mitra.userId;
      } else {
        if (toRole !== 'CUSTOMER') {
          throw new BadRequestException('Mitra hanya bisa menilai CUSTOMER pada order ini');
        }
        rateeId = order.customerId;
      }

      if (toRole === 'MITRA') {
        await tx.$queryRaw`SELECT id FROM "MitraProfile" WHERE id = ${order.mitraId} FOR UPDATE`;
      }

      const existing = await tx.rating.findUnique({
        where: { orderId_raterId: { orderId, raterId } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('Anda sudah memberi rating untuk order ini');
      }

      const rating = await tx.rating.create({
        data: { orderId, raterId, rateeId, stars, comment: comment?.trim() || null },
      });

      // Ratee mitra → recompute rata-rata; ratee customer → tidak ada agregat khusus.
      if (toRole === 'MITRA') {
        const agg = await tx.rating.aggregate({
          where: { rateeId },
          _avg: { stars: true },
          _count: { _all: true },
        });
        const ratingAvg = agg._avg.stars ?? 0;
        await tx.mitraProfile.update({
          where: { userId: rateeId },
          data: { rating: Math.round(ratingAvg * 100) / 100, ratingCount: agg._count._all },
        });
      }

      return {
        id: rating.id,
        orderId: rating.orderId,
        stars: rating.stars,
        comment: rating.comment,
        createdAt: rating.createdAt.toISOString(),
      };
    });
  }

  /** Rata-rata rating mitra untuk ditampilkan di detail mitra. */
  async mitraAggregates(mitraId: string): Promise<RatingAggregates> {
    const mitra = await this.prisma.mitraProfile.findUnique({
      where: { id: mitraId },
      select: { rating: true, ratingCount: true },
    });
    if (!mitra) throw new NotFoundException('Mitra tidak ditemukan');
    return { rating: mitra.rating, ratingCount: mitra.ratingCount };
  }
}
