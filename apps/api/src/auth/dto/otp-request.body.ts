import { Matches } from 'class-validator';
import { OtpRequestDto } from '@pijar/shared';

export class OtpRequestBody implements OtpRequestDto {
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'Format nomor telepon tidak valid (E.164)' })
  phone!: string;
}
