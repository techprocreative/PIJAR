import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { OtpVerifyDto, Role } from '@pijar/shared';

export class OtpVerifyBody implements OtpVerifyDto {
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'Format nomor telepon tidak valid (E.164)' })
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @IsEnum(['CUSTOMER', 'MITRA', 'ADMIN'] as const)
  role!: Role;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;
}
