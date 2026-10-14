import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding PIJAR…');

  const services = [
    { name: 'Full Body Massage', description: 'Pijat seluruh tubuh 60 menit dengan teknik relaksasi.', durationMinutes: 60, basePrice: 150000 },
    { name: 'Full Body Massage & Kerokan', description: 'Pijat tubuh dilanjutkan kerokan untuk melancarkan peredaran darah.', durationMinutes: 90, basePrice: 200000 },
    { name: 'Full Body Massage & Reflexology', description: 'Pijat tubuh dilanjutkan refleksi kaki.', durationMinutes: 90, basePrice: 200000 },
    { name: 'Full Body Massage & Scrub', description: 'Pijat tubuh dengan scrub aromaterapi untuk kulit halus.', durationMinutes: 105, basePrice: 250000 },
    { name: 'Full Body Massage & Totok Wajah', description: 'Pijat tubuh plus totok wajah untuk relaksasi menyeluruh.', durationMinutes: 105, basePrice: 250000 },
    { name: 'Reflexology 45', description: 'Refleksi kaki 45 menit.', durationMinutes: 45, basePrice: 100000 },
  ];
  for (const s of services) {
    await prisma.service.upsert({
      where: { id: `seed-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` },
      update: s,
      create: { id: `seed-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, ...s },
    });
  }

  // Admin demo (OTP login: nomor +628000000001, kode dev ada di log server saat DEV_MODE)
  await prisma.user.upsert({
    where: { phone: '+628000000001' },
    update: {},
    create: { phone: '+628000000001', name: 'Admin Pijar', role: 'ADMIN' },
  });

  // Mitra demo
  const mitraUser = await prisma.user.upsert({
    where: { phone: '+628000000002' },
    update: {},
    create: { phone: '+628000000002', name: 'Sari Terapis', role: 'MITRA' },
  });
  const existingMitra = await prisma.mitraProfile.findUnique({ where: { userId: mitraUser.id } });
  const mitra =
    existingMitra ??
    (await prisma.mitraProfile.create({
      data: { userId: mitraUser.id, gender: 'FEMALE', verification: 'VERIFIED' },
    }));

  // Hubungkan mitra demo ke semua layanan + posisi dekat Jakarta (untuk uji jarak bidding)
  for (const s of services) {
    await prisma.serviceMitra.upsert({
      where: { serviceId_mitraId: { serviceId: `seed-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, mitraId: mitra.id } },
      update: {},
      create: { serviceId: `seed-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, mitraId: mitra.id },
    });
  }
  await prisma.mitraProfile.update({
    where: { id: mitra.id },
    data: { lastLat: -6.19, lastLng: 106.78, status: 'ONLINE' },
  });

  console.log('Seed selesai.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
