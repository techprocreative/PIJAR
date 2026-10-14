import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletHelper } from './wallet.helper';

/**
 * Modul wallet. WalletHelper di-export agar modul lain (settlement, admin)
 * bisa memakai mutasi saldo atomik tanpa import circular — helper hanya
 * bergantung pada PrismaService (PrismaModule global).
 */
@Module({
  controllers: [WalletController],
  providers: [WalletService, WalletHelper],
  exports: [WalletService, WalletHelper],
})
export class WalletModule {}
