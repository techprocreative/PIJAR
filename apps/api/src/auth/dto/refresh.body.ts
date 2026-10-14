import { IsJWT } from 'class-validator';
import { RefreshDto } from '@pijar/shared';

export class RefreshBody implements RefreshDto {
  @IsJWT()
  refreshToken!: string;
}
