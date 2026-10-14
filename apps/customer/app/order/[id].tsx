import { useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { OrderDto } from '@pijar/shared';
import { Badge, Button, Card, COLORS, Divider, Row, STATUS_COLOR, Typography } from '../../src/components/ui';
import { rupiah, STATUS_LABEL, formatClock, formatDateTime, formatDistance } from '../../src/lib/format';
import { useOrders } from '../../src/store/orders';
import { useWallet } from '../../src/store/catalog';
import { ApiError } from '../../src/lib/api';
import { realtime } from '../../src/lib/realtime';
import { useLocalSearchParams, useRouter } from 'expo-router';

/** Estimasi jarak haversine (km) untuk tampilan. */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orders = useOrders((s) => s.myOrders);
  const activeOrder = useOrders((s) => s.activeOrder);
  const tracking = useOrders((s) => s.tracking);
  const fetchOrder = useOrders((s) => s.fetchOrder);
  const acceptBid = useOrders((s) => s.acceptBid);
  const walletBalance = useWallet((s) => s.wallet?.balance);
  const fetchWallet = useWallet((s) => s.fetchWallet);
  const cancelOrder = useOrders((s) => s.cancelOrder);
  const router = useRouter();
  const [busyBid, setBusyBid] = useState<string | null>(null);
  const order = useMemo(
    () => orders.find((o) => o.id === id) ?? (activeOrder?.id === id ? activeOrder : null),
    [orders, activeOrder, id],
  );

  useEffect(() => {
    if (!id) return;
    realtime.joinOrder(id);
    void fetchOrder(id).catch(() => undefined);
    return () => realtime.leaveOrder(id);
  }, [id, fetchOrder]);
  useEffect(() => {
    if (order?.status === 'BIDDING') void fetchWallet().catch(() => undefined);
  }, [order?.status, fetchWallet]);


  const mitraPos = tracking?.orderId === id ? tracking.location : order?.matchedMitra?.lastLocation ?? null;

  async function onAcceptBid(orderId: string, bidId: string) {
    setBusyBid(bidId);
    try {
      await acceptBid(orderId, bidId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.display : 'Gagal menerima tawaran';
      Alert.alert('Gagal', msg);
    } finally {
      setBusyBid(null);
    }
  }

  function confirmAcceptBid(orderId: string, bidId: string, price: number, mitraName: string) {
    const balance = walletBalance ?? 0;
    const cukup = balance >= price;
    Alert.alert(
      'Konfirmasi Pembayaran',
      `Terapis: ${mitraName}\nHarga final: ${rupiah(price)}\nSaldo Anda: ${rupiah(balance)}\n\n` +
        (cukup
          ? `${rupiah(price)} akan dipotong dari saldo saat terapis dipilih. Dana dikembalikan bila pesanan dibatalkan sebelum selesai.`
          : 'Saldo Anda tidak cukup untuk tawaran ini. Top up saldo terlebih dahulu (hubungi admin).'),
      cukup
        ? [
            { text: 'Batal', style: 'cancel' },
            { text: 'Konfirmasi & Bayar', style: 'default', onPress: () => void onAcceptBid(orderId, bidId) },
          ]
        : [{ text: 'Mengerti', style: 'cancel' }],
    );
  }



  if (!order) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.bg }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void fetchOrder(String(id)).catch(() => undefined)} />}
      >
        <Card>
          <Typography variant="h2">Pesanan</Typography>
          <Typography variant="muted" style={{ marginTop: 8 }}>
            Pesanan tidak ditemukan atau belum termuat. Tarik ke bawah untuk memuat ulang.
          </Typography>
          <Button
            title="Coba Lagi"
            variant="outline"
            onPress={() => void fetchOrder(String(id)).catch(() => undefined)}
            style={{ marginTop: 12 }}
          />
          <Button
            title="Kembali ke Beranda"
            variant="ghost"
            onPress={() => router.push('/(tabs)/')}
            style={{ marginTop: 4 }}
          />
        </Card>
      </ScrollView>
    );
  }

  const statusColor = STATUS_COLOR[order.status] ?? COLORS.info;
  const cancellable = ['BIDDING', 'MATCHED', 'MITRA_ON_THE_WAY', 'ARRIVED'].includes(order.status);
  const canRate = order.status === 'COMPLETED' || order.status === 'SETTLED';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void fetchOrder(order.id).catch(() => undefined)} />}
    >
      {/* Status header */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Typography variant="h2" style={{ flexShrink: 1 }}>
            {order.service.name}
          </Typography>
          <Badge label={STATUS_LABEL[order.status]} color={statusColor} />
        </Row>
        <Divider />
        <Typography variant="muted">Alamat: {order.address.label}</Typography>
        <Typography variant="small">{order.address.detail}</Typography>
        <Typography variant="muted" style={{ marginTop: 6 }}>
          Jadwal: {order.scheduledAt ? formatDateTime(order.scheduledAt) : 'Sesegera mungkin'}
        </Typography>
        <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <Typography variant="muted">Tawaran Anda</Typography>
          <Typography variant="body">{rupiah(order.customerPrice)}</Typography>
        </Row>
        {order.finalPrice ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Typography variant="muted">Harga final</Typography>
            <Typography variant="h2" style={{ color: COLORS.primaryDark }}>
              {rupiah(order.finalPrice)}
            </Typography>
          </Row>
        ) : null}
      </Card>

      {/* Peta: alamat + posisi mitra live */}
      {mitraPos ? (
        <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border }}>
          <MapView
            style={{ height: 240 }}
            initialRegion={{
              latitude: (mitraPos.lat + order.address.location.lat) / 2,
              longitude: (mitraPos.lng + order.address.location.lng) / 2,
              latitudeDelta: Math.max(0.02, Math.abs(mitraPos.lat - order.address.location.lat) * 2 + 0.01),
              longitudeDelta: Math.max(0.02, Math.abs(mitraPos.lng - order.address.location.lng) * 2 + 0.01),
            }}
          >
            <Marker
              coordinate={{ latitude: order.address.location.lat, longitude: order.address.location.lng }}
              title="Lokasi Anda"
              description={order.address.detail}
              pinColor={COLORS.primary}
            />
            <Marker
              coordinate={{ latitude: mitraPos.lat, longitude: mitraPos.lng }}
              title={order.matchedMitra?.name ?? 'Terapis'}
              description="Posisi terapis (live)"
              pinColor={COLORS.info}
            />
          </MapView>
          <View style={{ padding: 10, backgroundColor: COLORS.card }}>
            <Typography variant="small">
              Jarak terapis ≈{' '}
              {formatDistance(haversineKm(mitraPos, order.address.location))} · update terakhir{' '}
              {tracking?.orderId === id ? formatClock(tracking.at) : 'riwayat'}
            </Typography>
          </View>
        </View>
      ) : null}

      {/* BIDDING: daftar bid real-time */}
      {order.status === 'BIDDING' ? (
        <Card>
          <Typography variant="h2">Tawaran Terapis ({order.bids.length})</Typography>
          <Typography variant="small" style={{ marginBottom: 8 }}>
            Masuk real-time. Pilih satu tawaran — terapis lain otomatis ditolak.
          </Typography>
          {order.bids.length === 0 ? (
            <Typography variant="muted" style={{ marginTop: 8 }}>
              Menunggu terapis terdekat merespons… (terhubung realtime)
            </Typography>
          ) : null}
          <View style={{ gap: 10 }}>
            {order.bids.map((bid) => {
              const isAccept = bid.price <= order.customerPrice;
              return (
                <View
                  key={bid.id}
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: '#fff',
                  }}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Typography variant="body" style={{ fontWeight: '700' }}>
                      {bid.mitra.name} {bid.mitra.rating > 0 ? `⭐ ${bid.mitra.rating.toFixed(1)}` : ''}
                    </Typography>
                    <Typography variant="h2" style={{ color: COLORS.primaryDark }}>
                      {rupiah(bid.price)}
                    </Typography>
                  </Row>
                  <Typography variant="small" style={{ marginTop: 2 }}>
                    {isAccept ? 'Menerima harga Anda' : 'Menawar balik'} · ETA ~{bid.etaMinutes} menit · jarak{' '}
                    {formatDistance(bid.distanceKm)} · {bid.mitra.totalJobs} pekerjaan
                  </Typography>
                  <Button
                    title={isAccept ? 'Pilih Terapis' : `Setuju ${rupiah(bid.price)}`}
                    onPress={() => confirmAcceptBid(order.id, bid.id, bid.price, bid.mitra.name)}
                    loading={busyBid === bid.id}
                    disabled={busyBid !== null}
                    variant={isAccept ? 'primary' : 'outline'}
                    style={{ marginTop: 10 }}
                  />
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {/* MATCHED+: info terapis */}
      {order.matchedMitra && order.status !== 'BIDDING' ? (
        <Card>
          <Typography variant="h2">Terapis Anda</Typography>
          <Divider />
          <Typography variant="body" style={{ fontWeight: '700' }}>
            {order.matchedMitra.name}
          </Typography>
          <Typography variant="muted">
            ⭐ {order.matchedMitra.rating.toFixed(1)} · {order.matchedMitra.totalJobs} pekerjaan selesai
          </Typography>
          {order.status === 'MITRA_ON_THE_WAY' ? (
            <Typography variant="small" style={{ color: COLORS.info, marginTop: 8 }}>
              Terapis sedang menuju lokasi Anda — posisi diperbarui live.
            </Typography>
          ) : null}
          {order.status === 'ARRIVED' ? (
            <Typography variant="small" style={{ color: COLORS.primaryDark, marginTop: 8 }}>
              Terapis sudah tiba di lokasi Anda.
            </Typography>
          ) : null}
          {order.status === 'IN_PROGRESS' ? (
            <Typography variant="small" style={{ color: '#7C3AED', marginTop: 8 }}>
              Pijat sedang berlangsung. Santai!
            </Typography>
          ) : null}
        </Card>
      ) : null}

      {/* Aksi bawah */}
      <View style={{ gap: 10 }}>
        {cancellable ? (
          <Button
            title="Batalkan Pesanan"
            variant="danger"
            onPress={() => {
              Alert.alert('Batalkan Pesanan', 'Yakin membatalkan pesanan ini?', [
                { text: 'Tidak', style: 'cancel' },
                {
                  text: 'Ya, batalkan',
                  style: 'destructive',
                  onPress: () =>
                    void cancelOrder(order.id, 'Dibatalkan oleh customer').catch((err: unknown) =>
                      Alert.alert(
                        'Gagal',
                        err instanceof ApiError ? err.display : 'Gagal membatalkan pesanan',
                      ),
                    ),
                },
              ]);
            }}
          />
        ) : null}
        {canRate ? (
          <Button
            title="Beri Rating Terapis"
            variant="outline"
            onPress={() => router.push({ pathname: '/order/rate/[id]', params: { id: order.id } })}
          />
        ) : null}
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
