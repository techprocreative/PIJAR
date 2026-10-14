import { Body, Controller, Get, Post } from '@nestjs/common';
import { User } from '@prisma/client';
import { AuthTokensDto, OtpRequestDto, OtpVerifyDto, RefreshDto, UserDto } from '@pijar/shared';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { isDevMode } from '../common/config';
import { OtpRequestBody } from './dto/otp-request.body';
import { OtpVerifyBody } from './dto/otp-verify.body';
import { RefreshBody } from './dto/refresh.body';
import { AuthService } from './auth.service';
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: isDevMode() ? 100 : 5, ttl: 60_000 } })
  @Post('otp/request')
  async requestOtp(@Body() body: OtpRequestBody): Promise<{ ok: true; devCode?: string }> {
    return this.auth.requestOtp(body);
  }

  @Public()
  @Throttle({ default: { limit: isDevMode() ? 100 : 10, ttl: 60_000 } })
  @Post('otp/verify')
  async verifyOtp(@Body() body: OtpVerifyBody): Promise<AuthTokensDto> {
    return this.auth.verifyOtp(body);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: RefreshBody): Promise<AuthTokensDto> {
    return this.auth.refresh(body);
  }

  @Post('logout')
  async logout(@CurrentUser() user: User): Promise<{ ok: true }> {
    await this.auth.logout(user.id);
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: User): Promise<UserDto> {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      photoUrl: user.photoUrl,
      walletBalance: user.walletBalance,
    };
  }
}
// Re-export tipe kontrak supaya import dari controller rapi
export type { OtpRequestDto, OtpVerifyDto, RefreshDto };
