import { Controller, Get, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceDto } from '@pijar/shared';

@Controller('services')
export class ServicesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(): Promise<ServiceDto[]> {
    const rows = await this.prisma.service.findMany({
      where: { active: true },
      orderBy: { basePrice: 'asc' },
    });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      basePrice: s.basePrice,
      imageUrl: s.imageUrl,
      active: s.active,
    }));
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<ServiceDto> {
    const s = await this.prisma.service.findUniqueOrThrow({ where: { id } });
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      basePrice: s.basePrice,
      imageUrl: s.imageUrl,
      active: s.active,
    };
  }
}
