import { Controller, Body, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { User } from '@prisma/client';
import { OrderDto } from '@pijar/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@Roles('CUSTOMER', 'ADMIN')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderDto> {
    return this.orders.createOrder(user.id, dto);
  }

  @Get('mine')
  @Roles('CUSTOMER', 'MITRA', 'ADMIN')
  async mine(@CurrentUser() user: User): Promise<OrderDto[]> {
    return this.orders.listMine(user);
  }

  @Get(':id')
  @Roles('CUSTOMER', 'MITRA', 'ADMIN')
  async detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<OrderDto> {
    return this.orders.getOrder(user, id);
  }

  @Post(':id/accept-bid')
  @Roles('CUSTOMER', 'ADMIN')
  async acceptBid(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { bidId: string },
  ): Promise<OrderDto> {
    return this.orders.acceptBid(user.id, id, body.bidId);
  }

  @Post(':id/cancel')
  @Roles('CUSTOMER', 'MITRA', 'ADMIN')
  async cancel(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
  ): Promise<OrderDto> {
    return this.orders.cancelOrder(user, id, body?.reason);
  }

  /** Transisi status oleh mitra: on_the_way → arrived → in_progress → completed. */
  @Post(':id/status')
  @Roles('MITRA', 'ADMIN')
  async transition(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: 'MITRA_ON_THE_WAY' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' },
  ): Promise<OrderDto> {
    return this.orders.transitionStatus(user, id, body?.status);
  }

}
