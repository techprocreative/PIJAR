import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Order, Payment, Prisma, WalletTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type WalletTxnType = 'TOPUP' | 'ORDER_PAYMENT' | 'ORDER_EARNING' | 'REFUND' | 'WITHDRAWAL';

/** Parameter kredit/debit wallet; `tx` opsional agar bisa dipakai di dalam $transaction pemanggil. */
export interface WalletMoveParams {
  userId: string;
  amount: number;
  type: WalletTxnType;
  description: string;
  tx?: Prisma.TransactionClient;
}

/**
 * Helper wallet — satu-satunya jalur mutasi saldo di PIJAR.
 * Semua mutasi atomik: lock baris User (SELECT … FOR UPDATE) → update saldo →
 * insert WalletTransaction (ledger dengan balanceAfter). Dipakai oleh
 * admin.service (adjust), order escrow/refund, dan settlement.service (earning).
 */
@Injectable()
export class WalletHelper {
  constructor(private readonly prisma: PrismaService) {}

  /** Kredit saldo atomik; mengembalikan transaksi ledger dengan balanceAfter baru. */
  async credit(params: WalletMoveParams): Promise<WalletTransaction> {
    const { userId, amount, type, description, tx } = params;
    if (!Number.isInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
      throw new BadRequestException('Amount kredit wallet harus bilangan bulat positif');
    }
    const run = async (t: Prisma.TransactionClient) => {
      const [locked] = await t.$queryRaw<{ walletBalance: number }[]>`
        SELECT "walletBalance" FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!locked) throw new NotFoundException(`User ${userId} tidak ditemukan`);
      const balanceAfter = locked.walletBalance + amount;
      if (balanceAfter > 2_147_483_647) throw new BadRequestException('Saldo wallet melampaui batas');
      await t.user.update({ where: { id: userId }, data: { walletBalance: balanceAfter } });
      return t.walletTransaction.create({
        data: { userId, type, amount, balanceAfter, description },
      });
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Debit saldo atomik; menolak bila saldo tidak cukup. */
  async debit(params: WalletMoveParams): Promise<WalletTransaction> {
    const { userId, amount, type, description, tx } = params;
    if (!Number.isInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
      throw new BadRequestException('Amount debit wallet harus bilangan bulat positif');
    }
    const run = async (t: Prisma.TransactionClient) => {
      const [locked] = await t.$queryRaw<{ walletBalance: number }[]>`
        SELECT "walletBalance" FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!locked) throw new NotFoundException(`User ${userId} tidak ditemukan`);
      if (locked.walletBalance < amount) {
        throw new BadRequestException(`Saldo tidak cukup: butuh ${amount}, tersedia ${locked.walletBalance}`);
      }
      const balanceAfter = locked.walletBalance - amount;
      await t.user.update({ where: { id: userId }, data: { walletBalance: balanceAfter } });
      return t.walletTransaction.create({
        data: { userId, type, amount, balanceAfter, description },
      });
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Caller includes debit, payment proof, and assignment in the same transaction. */
  async chargeOrderToWallet(
    customerId: string,
    amount: number,
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<WalletTransaction> {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (order.customerId !== customerId) throw new ForbiddenException('Bukan order milik customer ini');
    if (order.status !== 'BIDDING') throw new ConflictException('Order tidak dalam fase bidding');
    const payment = await tx.payment.findUnique({ where: { orderId } });
    const debit = await tx.walletTransaction.findFirst({
      where: { userId: customerId, type: 'ORDER_PAYMENT', description: `Order payment (${orderId})` },
    });
    if (payment || debit) throw new ConflictException('Order sudah memiliki pembayaran');

    const rawFee = process.env.PLATFORM_FEE_PERCENT ?? '10';
    const feePercent = Number(rawFee);
    if (!rawFee.trim() || !Number.isFinite(feePercent) || feePercent < 0 || feePercent >= 100) {
      throw new InternalServerErrorException('PLATFORM_FEE_PERCENT harus >= 0 dan < 100');
    }
    const txn = await this.debit({
      userId: customerId, amount, type: 'ORDER_PAYMENT', description: `Order payment (${orderId})`, tx,
    });
    await tx.payment.create({
      data: {
        orderId, userId: customerId, method: 'WALLET', purpose: 'ORDER', status: 'PAID', amount,
        platformFee: Math.floor((amount * feePercent) / 100), paidAt: new Date(),
      },
    });
    return txn;
  }

  /** Must be called while holding the order lock; legacy/inconsistent escrow fails closed. */
  async requirePaidOrder(order: Order, tx: Prisma.TransactionClient): Promise<Payment> {
    const payment = await tx.payment.findUnique({ where: { orderId: order.id } });
    if (!payment || payment.userId !== order.customerId || payment.method !== 'WALLET' ||
      payment.purpose !== 'ORDER' || payment.status !== 'PAID' || !payment.paidAt ||
      payment.amount !== order.finalPrice || payment.amount <= 0 ||
      payment.platformFee < 0 || payment.platformFee >= payment.amount) {
      throw new ConflictException('Bukti escrow wallet order tidak valid');
    }
    const debits = await tx.walletTransaction.findMany({
      where: { userId: order.customerId, type: 'ORDER_PAYMENT', description: `Order payment (${order.id})` },
      select: { amount: true },
    });
    const refund = await tx.walletTransaction.findFirst({
      where: { userId: order.customerId, type: 'REFUND', description: `Order refund (${order.id})` },
    });
    if (debits.length !== 1 || debits[0].amount !== payment.amount || refund) {
      throw new ConflictException('Debit escrow order tidak valid');
    }
    return payment;
  }
}
