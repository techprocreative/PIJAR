# PIJAR — Setup & Menjalankan

Monorepo pnpm. Semua komponen: API NestJS, app customer (Expo), app mitra (Expo dev-client), admin panel (React+Vite).

## Prasyarat

- Node 20.12+ (native `loadEnvFile`), pnpm 9 (`npm i -g pnpm@9`)
- Docker (Postgres)

## 1. Database

```bash
docker run -d --name pijar-pg -e POSTGRES_USER=pijar -e POSTGRES_PASSWORD=pijar -e POSTGRES_DB=pijar -p 5433:5432 postgres:16
```

## 2. Backend (apps/api)

```bash
pnpm install
pnpm --filter @pijar/shared build          # wajib sebelum API (tsc paths → dist)
cd apps/api
cp .env.example .env                        # sesuaikan bila perlu (PORT default 3001 di .env)
npx prisma generate
npx prisma migrate deploy                   # atau: npx prisma db push
npx ts-node prisma/seed.ts                  # 6 layanan + admin & mitra demo
npx nest start                              # API di http://localhost:3001
```

**DEV_MODE=true** hanya berlaku di luar `NODE_ENV=production`. OTP lama dibatalkan saat kirim ulang; percobaan salah dibatasi. Refresh token disimpan sebagai hash. Mode non-dev mengembalikan HTTP 503 sampai provider pengiriman OTP nyata diimplementasikan — proyek ini belum siap produksi.

Akun demo (login via OTP, kode ada di response/log):
- ADMIN: `+628000000001`
- MITRA: `+628000000002`

## 3. App Customer (apps/customer)

```bash
EXPO_PUBLIC_API_URL=http://<ip-laptop>:3001 pnpm --filter @pijar/customer start
# atau: cd apps/customer && npx expo start
```

Regresi klien: `cd apps/customer && node scripts/check-lifecycle.cjs`.
Smoke HTTP/Socket.IO terisolasi: jalankan API pada `PORT=3011`, lalu `pnpm --filter @pijar/api check:live`.

## 4. App Mitra (apps/mitra)

Perlu dev-client (background location):

```bash
cd apps/mitra
EXPO_PUBLIC_API_URL=http://<ip-laptop>:3001 npx expo run:android   # pertama kali (build dev-client)
# selanjutnya: npx expo start --dev-client
```

## 5. Admin Panel (apps/admin)

```bash
pnpm dev:admin     # http://localhost:5174 (proxy /v1 & /ws → :3001)
```

Login: nomor admin `+628000000001` + kode OTP dari log server.

## Alur pengujian cepat

1. Admin → Verifikasi Mitra: approve mitra baru
2. Admin → Wallet Adjust: topup saldo customer (pengganti payment gateway sementara)
3. Customer: buat order (pilih layanan, alamat, tawar harga)
4. Mitra: toggle ONLINE → order masuk → accept / counter-bid
5. Customer: terima bid (saldo terpotong, escrow)
6. Mitra: transisi status ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED
7. Settlement atomik: mitra terima harga dikurangi fee yang disimpan saat match; order SETTLED
8. Rating dua arah

## Catatan arsitektur

- Lihat `ARCHITECTURE.md` untuk detail WS (namespace `/ws`, room, event).
- Payment gateway (Midtrans) **ditunda** — sementara pembayaran via wallet internal; topup manual oleh admin (`POST /v1/admin/wallet/adjust`).
- Kontrak tipe terpusat di `packages/shared/src/api.ts` — ubah di sana bila API berubah.
- Penarikan saldo belum tersedia; endpoint mengembalikan HTTP 501 tanpa mengubah saldo.
- Regresi PostgreSQL: `pnpm --filter @pijar/api check:auth` dan `pnpm --filter @pijar/api e2e:settlement` (fixture dibersihkan otomatis).
- Saldo, nomor HP, dan peran customer tidak disebarkan dalam payload order; mitra hanya melihat bid sendiri.
- Verifikasi perangkat Android/iOS dan background GPS belum dilakukan pada review ini.
