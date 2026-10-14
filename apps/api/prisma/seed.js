"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
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
    await prisma.user.upsert({
        where: { phone: '+628000000001' },
        update: {},
        create: { phone: '+628000000001', name: 'Admin Pijar', role: 'ADMIN' },
    });
    const mitraUser = await prisma.user.upsert({
        where: { phone: '+628000000002' },
        update: {},
        create: { phone: '+628000000002', name: 'Sari Terapis', role: 'MITRA' },
    });
    const existingMitra = await prisma.mitraProfile.findUnique({ where: { userId: mitraUser.id } });
    if (!existingMitra) {
        await prisma.mitraProfile.create({
            data: { userId: mitraUser.id, gender: 'FEMALE', verification: 'VERIFIED' },
        });
    }
    console.log('Seed selesai.');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
