import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ServicesModule } from './services/services.module';
import { OrdersModule } from './orders/orders.module';
import { BidsModule } from './bids/bids.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SettlementModule } from './settlement/settlement.module';
import { WalletModule } from './wallet/wallet.module';
import { RatingsModule } from './ratings/ratings.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ServicesModule,
    OrdersModule,
    BidsModule,
    RealtimeModule,
    SettlementModule,
    WalletModule,
    RatingsModule,
    AdminModule,
  ],
})
export class AppModule {}
