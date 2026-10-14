import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuthRoles } from '../auth/auth.decorators';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  AdminDashboardDto,
  DisputeDto,
  PromoBannerDto,
  VoucherDto,
  WalletTransactionDto,
} from '@pijar/shared';
import { AdminService } from './admin.service';

// ===== DTO =====

export class ResolveDisputeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  resolution: string;
}

export class AdjustWalletDto {
  @IsString()
  userId: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  description: string;
}

export class VoucherBodyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code: string;

  @IsIn(['PERCENT', 'AMOUNT'])
  type: 'PERCENT' | 'AMOUNT';

  @IsInt()
  @Min(1)
  value: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSpend?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDiscount?: number;

  @IsOptional()
  @IsBoolean()
  walletOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsISO8601()
  validUntil: string;
}

export class BulkVouchersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VoucherBodyDto)
  vouchers: VoucherBodyDto[];
}

export class PromoBannerBodyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  title: string;

  @IsUrl()
  imageUrl: string;

  @IsOptional()
  @IsUrl()
  linkUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class DecideVerificationDto {
  @IsIn(['VERIFIED', 'REJECTED'])
  decision: 'VERIFIED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class DisputeQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status?: 'OPEN' | 'RESOLVED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class OrdersOverviewQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// ===== Controller =====

@Controller('admin')
@AuthRoles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  async dashboard(): Promise<AdminDashboardDto> {
    return this.adminService.dashboard();
  }

  // --- Verifikasi mitra ---

  @Get('mitra/verifications')
  async pendingVerifications(@Query() query: PageQueryDto) {
    return this.adminService.pendingVerifications(query.page ?? 1, query.limit ?? 20);
  }

  @Post('mitra/verifications/:mitraId')
  @HttpCode(200)
  async decideVerification(
    @Param('mitraId') mitraId: string,
    @Body() dto: DecideVerificationDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.decideVerification(mitraId, dto.decision, adminId, dto.note);
  }

  // --- Disputes ---

  @Get('disputes')
  async disputes(@Query() query: DisputeQueryDto): Promise<{
    data: DisputeDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.adminService.disputes(query.status, query.page ?? 1, query.limit ?? 20);
  }

  @Post('disputes/:id/resolve')
  @HttpCode(200)
  async resolveDispute(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser('id') adminId: string,
  ): Promise<DisputeDto> {
    return this.adminService.resolveDispute(id, dto.resolution, adminId);
  }

  // --- Wallet manual (pengganti payment gateway sementara) ---

  @Post('wallet/adjust')
  @HttpCode(201)
  async adjustWallet(@Body() dto: AdjustWalletDto): Promise<WalletTransactionDto> {
    return this.adminService.adjustWallet(dto.userId, dto.amount, dto.description);
  }

  // --- Vouchers ---

  @Post('vouchers')
  @HttpCode(201)
  async createVoucher(@Body() dto: VoucherBodyDto): Promise<VoucherDto> {
    return this.adminService.createVoucher(dto);
  }

  @Post('vouchers/bulk')
  @HttpCode(201)
  async bulkCreateVouchers(@Body() dto: BulkVouchersDto): Promise<VoucherDto[]> {
    if (dto.vouchers.length === 0) {
      throw new BadRequestException('Daftar voucher kosong');
    }
    return this.adminService.bulkCreateVouchers(dto.vouchers);
  }

  @Get('vouchers')
  async listVouchers(@Query() query: PageQueryDto): Promise<{
    data: VoucherDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.adminService.listVouchers(query.page ?? 1, query.limit ?? 20);
  }

  @Post('vouchers/:id')
  @HttpCode(200)
  async updateVoucher(@Param('id') id: string, @Body() dto: VoucherBodyDto): Promise<VoucherDto> {
    return this.adminService.updateVoucher(id, dto);
  }

  // --- Promo banners ---

  @Post('banners')
  @HttpCode(201)
  async createBanner(@Body() dto: PromoBannerBodyDto): Promise<PromoBannerDto> {
    return this.adminService.createBanner(dto);
  }

  @Get('banners')
  async listBanners(@Query() query: PageQueryDto): Promise<{
    data: PromoBannerDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.adminService.listBanners(query.page ?? 1, query.limit ?? 20);
  }

  @Post('banners/:id')
  @HttpCode(200)
  async updateBanner(@Param('id') id: string, @Body() dto: PromoBannerBodyDto): Promise<PromoBannerDto> {
    return this.adminService.updateBanner(id, dto);
  }

  // --- Orders overview ---

  @Get('orders')
  async ordersOverview(@Query() query: OrdersOverviewQueryDto) {
    return this.adminService.ordersOverview(query.status, query.page ?? 1, query.limit ?? 20);
  }
}
