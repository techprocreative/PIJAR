import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Phone harus format E.164 Indonesia: +628xxxxxxxxx (8–15 digit setelah +62). */
export const PHONE_REGEX = /^\+62\d{8,15}$/;
export class OtpRequestDto {
  @Matches(PHONE_REGEX, { message: 'phone harus format E.164 Indonesia, contoh +6281234567890' })
  phone!: string;
}

export class OtpVerifyDto {
  @Matches(PHONE_REGEX, { message: 'phone harus format E.164 Indonesia, contoh +6281234567890' })
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code harus 6 digit' })
  code!: string;

  @IsString()
  @Matches(/^(CUSTOMER|MITRA|ADMIN)$/, { message: 'role harus CUSTOMER, MITRA, atau ADMIN' })
  role!: 'CUSTOMER' | 'MITRA' | 'ADMIN';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}
