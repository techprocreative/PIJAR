import { IsInt, IsPositive, Max, Min } from 'class-validator';

/**
 * Body request place-bid (orderId datang dari URL param /orders/:orderId/bids,
 * bukan dari body — kontrak PlaceBidDto di shared memakai orderId untuk client).
 */
export class PlaceBidBody {
  @IsInt()
  @IsPositive()
  price!: number;

  @IsInt()
  @Min(1)
  @Max(600)
  etaMinutes!: number;
}
