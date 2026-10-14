import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { User } from '@prisma/client';
import { BidDto } from '@pijar/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PlaceBidBody } from './dto/place-bid.dto';
import { BidsService } from './bids.service';

@Controller('orders/:orderId/bids')
@Roles('MITRA', 'ADMIN')
export class BidsController {
  constructor(private readonly bids: BidsService) {}

  /** Semua bid untuk order (customer lihat via OrderDto.bids; ini untuk admin/mitra). */
  @Get()
  @Roles('CUSTOMER', 'MITRA', 'ADMIN')
  async list(
    @CurrentUser() user: User,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<BidDto[]> {
    return this.bids.listByOrder(user, orderId);
  }

  /** Mitra accept harga customer (= bid dengan price = customerPrice) atau counter-bid. */
  @Post()
  async place(
    @CurrentUser() user: User,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: PlaceBidBody,
  ): Promise<BidDto> {
    return this.bids.placeBid(user.id, orderId, dto);
  }
}
