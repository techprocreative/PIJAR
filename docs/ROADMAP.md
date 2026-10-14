# PIJAR — Roadmap Lanjutan

Status: regresi transaksi PostgreSQL, auth, HTTP/Socket.IO, lifecycle sesi, build admin, dan login/logout browser telah diuji. Belum siap produksi: pengiriman OTP nyata, payout, serta verifikasi perangkat/background GPS belum tersedia atau belum diuji.

## Iterasi berikutnya (urutan rekomendasi)

1. **Payment gateway (Midtrans)** — ditunda sesuai keputusan
   - Snap redirect (VA, QRIS, e-wallet, kartu), webhook signature sha512
   - Topup otomatis menggantikan `POST /v1/admin/wallet/adjust`
   - Model `Payment` sekarang digunakan sebagai bukti escrow wallet; tidak ada modul gateway kosong
2. **Push notification (FCM)** — order baru ke mitra saat app di background; simpan token di `User.firebaseToken`
3. **Chat customer↔mitra** — room `order:{id}` sudah ada; tambah tabel message + event `chat:message`
4. **Peta tracking native** — upgrade dari marker OSM ke rute+ETA (Google Maps / OSRM directions)
5. **Verifikasi dokumen mitra** — upload KTP/sertifikat (model `MitraDocument` sudah ada), review di admin
6. **Voucher & promo engine** — CRUD admin sudah ada; apply saat accept-bid + validasi `walletOnly`
7. **Background GPS stabil** — TaskManager mitra sudah disiapkan; butuh dev-client build + uji lapangan
8. **Dispute flow** — model & admin resolve sudah ada; tambah pembukaan dispute dari app
9. **Deployment** — Docker Compose (api+postgres+admin), EAS Build untuk kedua app, CI lint+test

## Keputusan desain penting yang sudah diambil

- Stack TypeScript end-to-end; kontrak terpusat `packages/shared`
- Bidding real-time via Socket.IO (bukan polling seperti Dijasa)
- Escrow wallet: debit dan match satu transaksi; settlement dan refund atomik/idempoten, fee disimpan saat match
- Radius broadcast order bertingkat 3→5→10 km; counter-bid dibatasi 50%–300% tawaran
- OTP lokal hanya mode dev eksplisit; mode produksi tanpa provider mengembalikan HTTP 503, bukan sukses palsu
