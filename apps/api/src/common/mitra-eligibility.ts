import { Gender } from '@pijar/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Mitra eligible menerima order:
 * - terverifikasi admin (VERIFIED)
 * - status ONLINE (bukan OFFLINE / sedang ON_DUTY)
 * - gender cocok dengan preferensi customer (bila di-set)
 * - menawarkan layanan yang dipesan (relasi ServiceMitra)
 */
export async function findEligibleMitraIds(
  prisma: PrismaService,
  where: { serviceId: string; genderPreference?: Gender | null },
): Promise<Set<string>> {
  const rows = await prisma.mitraProfile.findMany({
    where: {
      verification: 'VERIFIED',
      status: 'ONLINE',
      ...(where.genderPreference ? { gender: where.genderPreference } : {}),
      services: { some: { serviceId: where.serviceId } },
    },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
