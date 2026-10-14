import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { createHash, createHmac, randomInt, randomUUID } from 'node:crypto';
import type { AuthTokensDto, Role } from '@pijar/shared';
import { PrismaService } from '../prisma/prisma.service';
import { isDevMode, jwtSecret } from '../common/config';
import { OtpRequestBody } from './dto/otp-request.body';
import { OtpVerifyBody } from './dto/otp-verify.body';

const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private otpHash(phone: string, code: string): string {
    return createHmac('sha256', process.env.OTP_HASH_SECRET || jwtSecret())
      .update(`${phone}:${code}`).digest('hex');
  }

  async requestOtp(body: OtpRequestBody): Promise<{ ok: true; devCode?: string }> {
    if (!isDevMode()) {
      throw new ServiceUnavailableException('Pengiriman OTP belum dikonfigurasi');
    }
    const phone = body.phone.startsWith('+') ? body.phone : `+${body.phone}`;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction(async (tx) => {
      // Serialize issuance and consumption even before a User exists.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phone})::bigint)`;
      await tx.otpCode.updateMany({ where: { phone, usedAt: null }, data: { usedAt: new Date() } });
      await tx.otpCode.create({ data: {
        phone, codeHash: this.otpHash(phone, code), expiresAt: new Date(Date.now() + 5 * 60_000),
      } });
    });
    this.logger.log(`[DEV OTP] ${phone} → ${code}`);
    return { ok: true, devCode: code };
  }

  async verifyOtp(body: OtpVerifyBody): Promise<AuthTokensDto> {
    const phone = body.phone.startsWith('+') ? body.phone : `+${body.phone}`;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phone})::bigint)`;
      const otp = await tx.otpCode.findFirst({
        where: { phone, usedAt: null }, orderBy: { createdAt: 'desc' },
      });
      if (!otp || otp.expiresAt <= new Date()) return { error: 'Kode OTP tidak valid atau kedaluwarsa' };
      if (otp.attempts >= OTP_MAX_ATTEMPTS) return { error: 'Percobaan OTP terlalu banyak' };
      if (otp.codeHash !== this.otpHash(phone, body.code)) {
        await tx.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
        return { error: 'Kode OTP salah' };
      }
      await tx.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
      const user = await this.findOrCreateUser(tx, phone, body.role ?? 'CUSTOMER', body.name);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      return { tokens: await this.issueTokens(tx, user.id, user.role as Role, user.phone) };
    });
    // Throw outside the transaction so failed guesses remain counted.
    if (result.error) throw new UnauthorizedException(result.error);
    return result.tokens!;
  }

  async refresh(body: { refreshToken: string }): Promise<AuthTokensDto> {
    let payload: { sub: string; type: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(body.refreshToken, { secret: jwtSecret() });
    } catch {
      throw new UnauthorizedException('Refresh token tidak valid');
    }
    if (payload.type !== 'refresh' || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Token salah jenis');
    }
    const tokens = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${payload.sub} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: payload.sub } });
      if (!user) return null;
      if (user.refreshToken !== createHash('sha256').update(body.refreshToken).digest('hex')) {
        await tx.user.update({ where: { id: user.id }, data: { refreshToken: null } });
        return null;
      }
      return this.issueTokens(tx, user.id, user.role as Role, user.phone);
    });
    if (!tokens) throw new UnauthorizedException('Refresh token sudah tidak berlaku');
    return tokens;
  }

  private async findOrCreateUser(tx: Prisma.TransactionClient, phone: string, role: Role, name?: string) {
    const existing = await tx.user.findUnique({ where: { phone } });
    if (existing) {
      if (existing.role !== role) throw new ForbiddenException('Peran akun tidak sesuai aplikasi');
      return existing;
    }
    if (role === 'ADMIN') throw new ForbiddenException('Registrasi admin tidak melalui OTP');
    return tx.user.create({ data: {
      phone, name: name?.trim() || `User ${phone.slice(-4)}`, role,
      ...(role === 'MITRA' ? { mitraProfile: { create: { gender: 'MALE' } } } : {}),
    } });
  }

  private async issueTokens(tx: Prisma.TransactionClient, userId: string, role: Role, phone: string): Promise<AuthTokensDto> {
    const accessToken = await this.jwt.signAsync({ sub: userId, role, phone, type: 'access' });
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: 'refresh', jti: randomUUID() }, { expiresIn: '30d' },
    );
    const user = await tx.user.update({ where: { id: userId }, data: { refreshToken: createHash('sha256').update(refreshToken).digest('hex') } });
    return { accessToken, refreshToken, user: {
      id: user.id, phone: user.phone, name: user.name, role: user.role as Role,
      photoUrl: user.photoUrl, walletBalance: user.walletBalance,
    } };
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
  }
}
