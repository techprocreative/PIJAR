# PIJAR Admin Panel (apps/admin)

Dashboard admin untuk platform PIJAR — React 18 + Vite + TailwindCSS +
TanStack Query/Router, terhubung ke API NestJS (`apps/api`) dan gateway
realtime Socket.IO (`/ws`, room `admin`).

## Fitur

| Halaman | Endpoint API | Keterangan |
|---|---|---|
| Login | `POST /v1/auth/otp/request` · `POST /v1/auth/otp/verify` | OTP phone, role ADMIN; dev code tampil otomatis saat `DEV_MODE=true` |
| Dashboard | `GET /v1/admin/dashboard` · `GET /v1/admin/orders` | Kartu ringkasan (order aktif, GMV, verifikasi, dispute, mitra online) + feed order terbaru; refresh real-time via WS |
| Verifikasi Mitra | `GET/POST /v1/admin/mitra/verifications*` | Daftar dokumen KTP/sertifikat, setujui/tolak |
| Dispute | `GET /v1/admin/disputes` · `POST /v1/admin/disputes/:id/resolve` | Filter OPEN/RESOLVED, tulis resolusi |
| Orders | `GET /v1/admin/orders` | Semua order + filter status + paginasi; update real-time via WS |
| Voucher | `GET/POST /v1/admin/vouchers*` | CRUD + bulk create |
| Promo Banner | `GET/POST /v1/admin/banners*` | CRUD + preview gambar |
| Wallet Adjust | `POST /v1/admin/wallet/adjust` | Topup/penyesuaian saldo manual (pengganti gateway sementara) |

## Realtime

Koneksi Socket.IO ke namespace `/ws` (diproxie Vite dev server → API).
Handshake membawa access token JWT; server otomatis memasukkan admin ke
room `admin`. Event (`order:new`, `order:status`, `order:cancelled`,
`mitra:status`, …) memicu invalidation query TanStack — data dashboard dan
daftar order selalu segar tanpa polling.

## Sesi & keamanan

- Access + refresh token disimpan di `localStorage` (refresh rotation
  diimplementasikan server; `authorizedFetch` otomatis refresh saat 401,
  dan logout paksa bila refresh gagal).
- Semua request HTTP lewat wrapper ber-token; tidak ada secret di client.

## Menjalankan

```bash
# dari root monorepo (API + Postgres harus jalan dulu — lihat docs/SETUP)
pnpm dev:admin        # Vite di :5174, proxy /ws → localhost:3001

# build produksi
pnpm --filter @pijar/admin build
```

Akun admin demo (hasil seed): `+628000000001` — saat `DEV_MODE=true`,
kode OTP dikembalikan endpoint dan ditampilkan di layar login.
