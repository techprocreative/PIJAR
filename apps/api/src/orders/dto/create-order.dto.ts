import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderDto as ICreateOrderDto, Gender } from '@pijar/shared';
import { GeoPointDto } from '../../common/dto';

export class CreateOrderDto implements ICreateOrderDto {
  @IsString()
  serviceId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  addressLabel!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  addressDetail!: string;

  @Type(() => GeoPointDto)
  @ValidateNested()
  location!: GeoPointDto;

  @IsOptional()
  @IsString()
  scheduledAt?: string | null;

  /** Tawaran awal customer (rupiah, tanpa sen). */
  @IsInt()
  @IsPositive()
  customerPrice!: number;

  @IsOptional()
  @IsEnum(['MALE', 'FEMALE'] as const)
  therapistGenderPreference?: Gender | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
