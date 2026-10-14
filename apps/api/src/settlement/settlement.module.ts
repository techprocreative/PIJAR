import { Module } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementModule {}
