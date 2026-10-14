import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { AuthRoles } from '../auth/auth.decorators';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { WalletDto, WalletTransactionDto } from '@pijar/shared';
import { WalletService, WalletTxnPage } from './wallet.service';

export class WithdrawDto {
  @IsInt()
  @Min(1000)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class TxnPageQuery {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @AuthRoles('CUSTOMER', 'MITRA', 'ADMIN')
  async getWallet(@CurrentUser() user: AuthUser): Promise<WalletDto> {
    return this.walletService.getWallet(user.id);
  }

  @Get('transactions')
  @AuthRoles('CUSTOMER', 'MITRA', 'ADMIN')
  async listTransactions(
    @CurrentUser() user: AuthUser,
    @Query() query: TxnPageQuery,
  ): Promise<WalletTxnPage> {
    return this.walletService.listTransactions(user.id, query.page, query.limit);
  }

  @Post('withdraw')
  @AuthRoles('MITRA')
  async withdraw(@CurrentUser() user: AuthUser, @Body() dto: WithdrawDto): Promise<WalletTransactionDto> {
    return this.walletService.withdraw(user.id, dto.amount, dto.description);
  }
}
