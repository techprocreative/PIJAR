import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WalletTransaction } from '@prisma/client';
import { WalletHelper } from '../wallet/wallet.helper';

@Injectable()
export class SettlementService {
  constructor(private readonly walletHelper: WalletHelper) {}

  /** Completion, credit, job count, and release commit together in the caller's transaction. */
  async settleOrder(orderId: string, tx: Prisma.TransactionClient): Promise<WalletTransaction | null> {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (order.status === 'SETTLED') return null;
    if (order.status !== 'COMPLETED' || !order.mitraId) {
      throw new ConflictException('Hanya order selesai dengan mitra yang dapat diselesaikan pembayarannya');
    }
    await tx.$queryRaw`SELECT id FROM "MitraProfile" WHERE id = ${order.mitraId} FOR UPDATE`;
    const mitra = await tx.mitraProfile.findUnique({ where: { id: order.mitraId } });
    if (!mitra) throw new NotFoundException('Mitra tidak ditemukan');
    if (mitra.userId === order.customerId) throw new ConflictException('Mitra tidak boleh menerima order sendiri');
    const payment = await this.walletHelper.requirePaidOrder(order, tx);
    const duplicate = await tx.walletTransaction.findFirst({
      where: {
        userId: mitra.userId, type: 'ORDER_EARNING',
        description: { startsWith: `Order earning (${orderId}), fee ` },
      },
    });
    if (duplicate) throw new ConflictException('Ledger earning tidak konsisten dengan status order');
    const earning = await this.walletHelper.credit({
      userId: mitra.userId,
      amount: payment.amount - payment.platformFee,
      type: 'ORDER_EARNING',
      description: `Order earning (${orderId}), fee ${payment.platformFee}`,
      tx,
    });
    await tx.order.update({ where: { id: orderId }, data: { status: 'SETTLED' } });
    await tx.mitraProfile.update({
      where: { id: mitra.id },
      data: { status: mitra.verification === 'VERIFIED' ? 'ONLINE' : 'OFFLINE', totalJobs: { increment: 1 } },
    });
    return earning;
  }
}
