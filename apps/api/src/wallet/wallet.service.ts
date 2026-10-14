import { Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { WalletDto, WalletTransactionDto } from '@pijar/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface WalletTxnPage {
  data: WalletTransactionDto[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(userId: string): Promise<WalletDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return { balance: user.walletBalance, currency: 'IDR' };
  }

  async listTransactions(userId: string, page = 1, limit = 20): Promise<WalletTxnPage> {
    const [total, rows] = await Promise.all([
      this.prisma.walletTransaction.count({ where: { userId } }),
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      data: rows.map((txn) => this.toTxnDto(txn)),
      total,
      page,
      limit,
    };
  }

  /** No payout provider: never debit a wallet for an unfulfilled withdrawal. */
  async withdraw(_userId: string, _amount: number, _description?: string): Promise<WalletTransactionDto> {
    throw new NotImplementedException('Penarikan belum tersedia: integrasi payout belum diaktifkan');
  }

  private toTxnDto(txn: {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string;
    createdAt: Date;
  }): WalletTransactionDto {
    return {
      id: txn.id,
      type: txn.type as WalletTransactionDto['type'],
      amount: txn.amount,
      balanceAfter: txn.balanceAfter,
      description: txn.description,
      createdAt: txn.createdAt.toISOString(),
    };
  }
}
