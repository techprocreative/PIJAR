# PIJAR Mitra — App Terapis (Expo + dev-client)

App terapis PIJAR: menerima broadcast order real-time (WS), bidding/accept,
live tracking posisi (foreground + background), transisi status order,
wallet & penarikan saldo.

## Stack

- Expo SDK 52 + dev-client (perlu native module: expo-location background task)
- React Native 0.76, TypeScript strict
- Zustand (state), socket.io-client (realtime), AsyncStorage (sesi)

## Struktur

```
apps/mitra/
├── app.json              # konfigurasi Expo + izin lokasi (fg+bg)
├── index.ts              # entry (registerRootComponent)
└── src/
    ├── App.tsx           # bootstrap: sesi → WS → restore order aktif
    ├── MainTabs.tsx      # tab bawah: Order | Saldo
    ├── navigation.tsx    # rute berbasis state auth
    ├── config/env.ts     # API_URL / WS_URL (extra.apiUrl di app.json)
    ├── constants.ts      # state machine order + aturan bidding
    ├── api/
    │   ├── client.ts     # REST v1 + auto refresh token (rotasi)
    │   └── storage.ts    # persist sesi + order aktif
    ├── realtime/socket.ts# namespace /ws, auth token, ack helpers
    ├── services/location.ts # izin, watch fg, TaskManager bg, event router
    ├── state/
    │   ├── auth.ts       # OTP login/logout zustand
    │   ├── orders.ts     # antrian order baru, bid, order aktif
    │   └── wallet.ts     # saldo + transaksi paginasi
    ├── components/ui.tsx # design tokens + komponen dasar
    └── screens/
        ├── LoginScreen.tsx  # OTP (devCode tampil saat DEV_MODE)
        ├── HomeScreen.tsx   # online toggle, bid, transisi status
        └── WalletScreen.tsx # saldo, riwayat, withdraw
```

## Kontrak yang diikuti

- REST prefix `v1`; auth OTP role `MITRA`; access 15m + refresh 30d rotasi.
- WS namespace `/ws` dengan `auth: { token }`; room `mitra:orders` otomatis
  saat handshake; `mitra:listen_orders {lat,lng}` untuk filter radius
  bertingkat 3→5→10 km.
- Transisi mitra: MATCHED → MITRA_ON_THE_WAY → ARRIVED → IN_PROGRESS →
  COMPLETED (POST /v1/orders/:id/status).
- Counter-bid 50%–300% tawaran customer; jarak max 15 km.
- Settlement async: COMPLETED → (server) SETTLED + `wallet:updated` ke
  room `user:{mitraUserId}`.

### Catatan desain: deteksi MATCHED

Kontrak API tidak mengekspos `GET /v1/orders/:id` untuk role MITRA dan
`BidDto` tidak memuat `status`. Mitra juga belum bisa join room order
sebelum matched. Solusi dalam batas kontrak:

1. Mitra bid → polling re-upsert bid (idempoten).
2. `400 "Order tidak dalam fase bidding"` → order keluar fase BIDDING.
3. Probe `order:join` ack: ok = kita pemenangnya (MATCHED); ditolak = kalah.

## Menjalankan

```bash
# 1. API jalan (apps/api, port 3001) + DB ter-seed
pnpm --filter @pijar/api dev

# 2. Dev client Android (perangkat/emu; pertama kali build debug):
pnpm --filter @pijar/mitra android

# 3. Setelah dev-client terpasang, metro biasa:
pnpm --filter @pijar/mitra start

# Perangkat fisik: ganti extra.apiUrl di app.json dengan LAN IP,
# atau set EXPO_PUBLIC_API_URL=http://<LAN-IP>:3001
```

## Akun uji (seed)

- Mitra: `+628000000002` — OTP tampil di layar login saat `DEV_MODE=true`
  (server mengembalikan `devCode`).
