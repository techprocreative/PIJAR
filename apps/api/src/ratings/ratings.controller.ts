import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthRoles } from '../auth/auth.decorators';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { RateDto, Role } from '@pijar/shared';
import { RatingsService } from './ratings.service';

export class RateBodyDto implements RateDto {
  @IsString()
  orderId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  stars: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsString()
  toRole: Role;
}

export class RateResponseDto {
  id: string;
  orderId: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post()
  @AuthRoles('CUSTOMER', 'MITRA')
  async rate(@CurrentUser() user: AuthUser, @Body() dto: RateBodyDto): Promise<RateResponseDto> {
    return this.ratingsService.submitRating(user.id, dto.orderId, dto.stars, dto.toRole, dto.comment);
  }

  @Get('mitra/:mitraId')
  @AuthRoles('CUSTOMER', 'MITRA', 'ADMIN')
  async mitraRating(@Param('mitraId') mitraId: string) {
    return this.ratingsService.mitraAggregates(mitraId);
  }
}
