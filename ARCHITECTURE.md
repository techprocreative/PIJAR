# PIJAR — Platform On-Demand Massage & Wellness

Platform massage/wellness: aplikasi customer dan mitra berbasis Expo,
backend NestJS/PostgreSQL, serta panel admin. Payment gateway belum diaktifkan.

> Nama produk sementara: **PIJAR** (ganti sesuai branding final).

## Arsitektur

```
pijar/
├── apps/
│   ├── customer/        # Expo (React Native) — app pelanggan
│   ├── mitra/           # Expo + dev-client — app terapis, GPS
│   ├── admin/           # React + Vite + Tailwind — dashboard admin
│   └── api/             # NestJS + Prisma + PostgreSQL + Socket.IO
├── packages/
│   └── shared/          # Tipe & kontrak API (dipakai semua apps)
├── pnpm-workspace.yaml
└── turbo.json
```

## Stack

| Komponen | Teknologi |
|---|---|
| Backend | NestJS 10, Prisma ORM, PostgreSQL 16, Socket.IO |
| Auth | OTP lokal khusus dev; provider pengiriman belum tersedia. JWT access+refresh |
| Real-time | Socket.IO — room per-order untuk bidding & tracking; room per-mitra untuk broadcast order |
| Payment | Escrow wallet internal + settlement saldo mitra; gateway dan payout ditunda |
| Maps | OpenStreetMap tiles + Nominatim (biaya nol) — upgrade ke Google Maps bila perlu |
| Customer app | Expo SDK 52+, Expo Router, Zustand, react-native-maps (OSM), Socket.IO client |
| Mitra app | Expo + expo-dev-client, expo-location + TaskManager |
| Admin | React 18 + Vite + TailwindCSS + TanStack Query/Router |

## Perbaikan utama dibanding DIJASA

1. **Bidding real-time**: order di-broadcast via WebSocket ke terapis radius N km; counter-bid tampil instan di app customer (Dijasa: polling/endpoints lama).
2. **Live tracking**: posisi mitra dikirim via WebSocket; background GPS perlu uji perangkat.
3. **Satu API modern**: v1 REST + WS konsisten untuk semua klien (Dijasa: dua generasi API bercampur).
4. **Keamanan**: tidak ada API key di client; secrets via env; refresh token rotation; rate-limit OTP.
5. **Wallet**: penerimaan bid, debit, assignment, refund, dan settlement dijaga transaksi PostgreSQL.
6. **Verifikasi mitra**: admin menyetujui/menolak status; upload dokumen belum tersedia.

## Alur inti (flow pembeda)

1. Customer pilih layanan + preferensi terapis (pria/wanita) + alamat & jam
2. Customer **menawar harga** (bid awal) atau pakai harga normal
3. Server broadcast order ke mitra online terdekat (WS, radius bertingkat 3→5→10 km)
4. Mitra **accept** (harga customer) atau **counter-bid**; customer lihat masuk real-time, pilih satu
5. Order matched → tracking live → mitra tiba → start → selesai
6. Saldo customer didebit saat bid diterima; penyelesaian mengkredit saldo mitra setelah fee.

## Status order (state machine)

```
DRAFT → BIDDING → MATCHED → MITRA_ON_THE_WAY → ARRIVED → IN_PROGRESS
      → COMPLETED → SETTLED
Status yang dapat dibatalkan → CANCELLED
```

Pembatalan mengembalikan escrow sekali; SETTLED tidak bisa dibatalkan.


## Realtime Gateway (Socket.IO)

- Namespace: `/ws` — handshake wajib membawa access token JWT:
  `io(url + '/ws', { auth: { token: accessToken } })`
- Room: `order:{orderId}` (customer + mitra matched + admin), `mitra:orders`
  (broadcast order baru, radius bertingkat 3→5→10 km), `admin` (monitoring).
- Client→server: `mitra:listen_orders`, `mitra:stop_orders`, `mitra:location`, `order:join`
- Server→client: lihat `ServerEvent` di `packages/shared/src/api.ts`
- Implementasi: `apps/api/src/realtime/realtime.gateway.ts`

## Uji end-to-end

```bash
# PostgreSQL lokal harus tersedia; regresi transaksi memakai fixture terisolasi:
pnpm --filter @pijar/api check:auth
pnpm --filter @pijar/api e2e:settlement
pnpm --filter @pijar/api check:realtime
# Server hasil review pada :3011 (override API bila perlu):
pnpm --filter @pijar/api check:live
```

## Dokumen

- Skema database: `apps/api/prisma/schema.prisma`
- Kontrak API: `packages/shared/src/api.ts`
- Setup: `docs/SETUP.md`
