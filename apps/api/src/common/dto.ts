import { GeoPoint } from '@pijar/shared';
import { IsNumber, Max, Min } from 'class-validator';

export class GeoPointDto implements GeoPoint {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
