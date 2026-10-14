# PIJAR Customer (Expo)

App pelanggan PIJAR — pijat & wellness on-demand. Dibangun sesuai kontrak
`ARCHITECTURE.md` + `packages/shared/src/api.ts`.

## Stack

- Expo SDK 52, Expo Router (file-based routing), React Native 0.76
- Zustand (state), socket.io-client (realtime bidding & tracking)
- react-native-maps dengan tile OpenStreetMap + Nominatim geocoding (biaya nol)
- expo-secure-store (persist access/refresh token)

## Alur yang didukung

1. **Login OTP** (`/login`) — phone OTP; dev mode menampilkan kode dari server.
2. **Beranda** — saldo dompet, pesanan aktif, katalog layanan.
3. **Pesan pijat** (`/order/new`) — pilih layanan, alamat (GPS/pencarian Nominatim),
   preferensi gender terapis, dan **tawaran harga** (bidding; minimum 50% harga dasar).
4. **Detail pesanan** (`/order/[id]`) —
   - tawaran terapis masuk **real-time** (`order:bid` via Socket.IO room `order:{id}`)
   - pilih tawaran → `order:matched` (pembayaran wallet otomatis oleh server)
   - **live tracking** posisi terapis (`tracking:location`) di peta + jarak
   - transisi status live (`order:status`), pembatalan (`order:cancelled`)
5. **Riwayat** (`/(tabs)/orders`) — semua pesanan + status.
6. **Profil & Dompet** (`/(tabs)/profile`) — saldo, ledger transaksi, logout.
7. **Rating** (`/order/rate/[id]`) — bintang 1–5 untuk terapis setelah selesai.

## Realtime (namespace `/ws`)

Handshake membawa access token (lihat `src/lib/realtime.ts`):

```ts
io(url + '/ws', { auth: { token: accessToken } })
```

Event yang dikonsumsi: `order:new`, `order:bid`, `order:matched`, `order:status`,
`order:cancelled`, `tracking:location`, `wallet:updated` (kontrak `ServerEvent` di
`@pijar/shared`). Reconnect otomatis me-rejoin room order.

## Menjalankan

```bash
# 1. API harus jalan (default http://<host-laptop>:3001)
pnpm --filter @pijar/api dev

# 2. Customer app — arahkan ke host laptop:
EXPO_PUBLIC_API_URL=http://192.168.x.x:3001 pnpm --filter @pijar/customer start

# tanpa env: otomatis memakai host Expo (debuggerHost) + port 3001
```

Typecheck: `pnpm --filter @pijar/customer typecheck`

## Catatan MVP

- Pembayaran Midtrans Snap ditunda di API (`payments.module.ts`); app sudah siap
  menampilkan `payment` dari `OrderDto` begitu gateway aktif.
- Top-up wallet dikelola admin (MVP); pemotongan saldo saat match sudah otomatis
  server-side.
