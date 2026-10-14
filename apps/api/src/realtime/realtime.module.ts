import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { jwtSecret } from '../common/config';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [JwtModule.registerAsync({
    useFactory: () => ({
      global: true,
      secret: jwtSecret(),
      signOptions: { expiresIn: '15m' },
    }),
  })],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
