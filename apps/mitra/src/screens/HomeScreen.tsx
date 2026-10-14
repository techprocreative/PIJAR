import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../state/auth';
import { useOrderStore, type NewOrderEntry } from '../state/orders';
import { useWalletStore } from '../state/wallet';
import {
  requestLocationPermission,
  startOnlineMode,
  goOffline,
} from '../services/location';
import {
  BodyText,
  Button,
  Card,
  COLORS,
  ErrorBanner,
  Heading,
  StatusChip,
} from '../components/ui';
import { COUNTER_BID_MAX_FACTOR, COUNTER_BID_MIN_FACTOR, formatRupiah } from '../constants';
import type { OrderDto } from '@pijar/shared';

export function HomeScreen() {
  const { tokens, logout } = useAuthStore();
  const orders = useOrderStore();
  const wallet = useWalletStore();
  const online = orders.online;
  const [startingUp, setStartingUp] = useState(false);

  useEffect(() => {
    void wallet.refresh();
  }, [wallet.refresh]);

  async function toggleOnline(value: boolean) {
    if (value) {
      const granted = await requestLocationPermission();
      if (!granted) {
        Alert.alert('Izin lokasi ditolak', 'Izinkan lokasi untuk menerima order terdekat.');
        return;
      }
      setStartingUp(true);
      try {
        await startOnlineMode();
      } catch (err) {
        Alert.alert('Gagal online', err instanceof Error ? err.message : String(err));
      } finally {
        setStartingUp(false);
      }
    } else {
      try { await goOffline(); }
      catch (err) { Alert.alert('Gagal offline', err instanceof Error ? err.message : String(err)); }
    }
  }

  const active = orders.active;
  const hasNewOrders = orders.newOrders.length > 0;

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              void wallet.refresh();
              void orders.restoreActiveOrder();
            }}
          />
        }
      >
        <Card>
          <View style={styles.headerRow}>
            <View style={styles.flex}>
              <Heading size={22}>Halo, {tokens?.user.name ?? 'Mitra'}</Heading>
              <BodyText muted style={styles.mt4}>
                {active != null
                  ? 'Sedang melayani order — selesaikan sebelum menerima order baru'
                  : online
                    ? 'Online — menerima order terdekat'
                    : 'Offline — aktifkan untuk menerima order'}
              </BodyText>
            </View>
            <Switch
              value={online}
              onValueChange={toggleOnline}
              disabled={startingUp || active != null}
              trackColor={{ true: COLORS.primary, false: COLORS.border }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.walletRow}>
            <BodyText muted>Saldo</BodyText>
            <Heading size={20}>{wallet.wallet ? formatRupiah(wallet.wallet.balance) : '—'}</Heading>
          </View>
          {active != null ? (
            <BodyText muted style={styles.mt4}>
              Status Anda otomatis kembali Online setelah order selesai.
            </BodyText>
          ) : null}
          <Button
            label="Keluar"
            variant="outline"
            onPress={() =>
              Alert.alert('Keluar', 'Keluar dari akun mitra?', [
                { text: 'Batal', style: 'cancel' },
                { text: 'Keluar', style: 'destructive', onPress: () => void logout() },
              ])
            }
            style={styles.mt12}
          />
        </Card>

        <ErrorBanner message={orders.error} />
        <ErrorBanner message={wallet.error} />

        {active ? <ActiveOrderCard order={active.order} /> : null}

        <Heading size={18} style={styles.sectionGap}>
          Order Baru {hasNewOrders ? `(${orders.newOrders.length})` : ''}
        </Heading>
        {!online ? (
          <Card>
            <BodyText muted>
              Aktifkan mode online untuk menerima broadcast order baru di radius Anda.
            </BodyText>
          </Card>
        ) : hasNewOrders ? (
          orders.newOrders.map((entry) => (
            <NewOrderCard key={entry.order.id} entry={entry} />
          ))
        ) : (
          <Card>
            <BodyText muted>
              Belum ada order masuk. Menunggu broadcast pelanggan di sekitar…
            </BodyText>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

/** Kartu peluang order baru — bid / accept langsung. */
function NewOrderCard({ entry }: { entry: NewOrderEntry }) {
  const orders = useOrderStore();
  const [bidModalVisible, setBidModalVisible] = useState(false);
  const order = entry.order;

  return (
    <Card>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Heading size={17}>{order.service.name}</Heading>
          <BodyText muted style={styles.mt2}>
            {order.service.durationMinutes} menit • {order.customer.name}
          </BodyText>
        </View>
        <StatusChip status={order.status} />
      </View>

      <View style={styles.detailBox}>
        <BodyText muted style={styles.small}>
          Alamat
        </BodyText>
        <BodyText>
          {order.address.label} — {order.address.detail}
        </BodyText>
      </View>

      <View style={styles.priceRow}>
        <View>
          <BodyText muted style={styles.small}>
            Tawaran customer
          </BodyText>
          <Heading size={18}>{formatRupiah(order.customerPrice)}</Heading>
        </View>
      </View>

      {entry.myBid ? (
        <View style={styles.bidSentBox}>
          <BodyText style={styles.bidSentText}>
            Bid terkirim: {formatRupiah(entry.myBid.price)} • ETA {entry.myBid.etaMinutes} menit.
            Menunggu keputusan customer…
          </BodyText>
        </View>
      ) : (
        <View style={styles.actionsRow}>
          <Button
            label={`Ajukan ${formatRupiah(order.customerPrice)}`}
            variant="success"
            onPress={() => void orders.placeBid(order.id, order.customerPrice, 20)}
            loading={orders.busy}
            style={styles.flex}
          />
          <View style={styles.gapH} />
          <Button
            label="Tawar Harga Lain"
            variant="outline"
            onPress={() => setBidModalVisible(true)}
            disabled={orders.busy}
            style={styles.flex}
          />
        </View>
      )}

      <CounterBidModal
        visible={bidModalVisible}
        order={order}
        onClose={() => setBidModalVisible(false)}
      />
    </Card>
  );
}

/** Modal counter-bid dengan validasi rentang server (50%–300% tawaran). */
function CounterBidModal({
  visible,
  order,
  onClose,
}: {
  visible: boolean;
  order: OrderDto;
  onClose: () => void;
}) {
  const orders = useOrderStore();
  const min = Math.floor(order.customerPrice * COUNTER_BID_MIN_FACTOR);
  const max = Math.floor(order.customerPrice * COUNTER_BID_MAX_FACTOR);
  const [price, setPrice] = useState(String(order.customerPrice));
  const [eta, setEta] = useState('20');

  const priceNum = Number(price);
  const valid =
    Number.isFinite(priceNum) && priceNum >= min && priceNum <= max && Number(eta) > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Card style={styles.modalCard}>
          <Heading size={18}>Tawar Balik</Heading>
          <BodyText muted style={styles.mt4}>
            Rentang {formatRupiah(min)} – {formatRupiah(max)}
          </BodyText>

          <BodyText muted style={styles.label}>
            Harga Anda (Rp)
          </BodyText>
          <TextInput
            value={price}
            onChangeText={setPrice}
            keyboardType="number-pad"
            style={styles.input}
          />
          <BodyText muted style={styles.label}>
            ETA (menit)
          </BodyText>
          <TextInput
            value={eta}
            onChangeText={setEta}
            keyboardType="number-pad"
            style={styles.input}
          />

          <View style={styles.actionsRow}>
            <Button
              label="Batal"
              variant="outline"
              onPress={onClose}
              style={styles.flex}
            />
            <View style={styles.gapH} />
            <Button
              label="Kirim Tawaran"
              disabled={!valid}
              loading={orders.busy}
              onPress={async () => {
                const ok = await orders.placeBid(order.id, priceNum, Number(eta));
                if (ok) onClose();
              }}
              style={styles.flex}
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

/** Kartu order aktif — transisi status oleh mitra. */
function ActiveOrderCard({ order }: { order: OrderDto }) {
  const orders = useOrderStore();
  const [cancelVisible, setCancelVisible] = useState(false);
  const nextMap: Record<string, { label: string; next: 'MITRA_ON_THE_WAY' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' }> = {
    MATCHED: { label: 'Mulai Jalan ke Lokasi', next: 'MITRA_ON_THE_WAY' },
    MITRA_ON_THE_WAY: { label: 'Sudah Sampai', next: 'ARRIVED' },
    ARRIVED: { label: 'Mulai Pengerjaan', next: 'IN_PROGRESS' },
    IN_PROGRESS: { label: 'Selesaikan Order', next: 'COMPLETED' },
  };
  const next = nextMap[order.status];

  return (
    <Card style={styles.activeCard}>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Heading size={17}>{order.service.name}</Heading>
          <BodyText muted style={styles.mt2}>
            {order.customer.name} • {formatRupiah(order.finalPrice ?? order.customerPrice)}
          </BodyText>
          <BodyText muted style={styles.mt2}>
            {order.address.label} — {order.address.detail}
          </BodyText>
        </View>
        <StatusChip status={order.status} />
      </View>

      <BodyText muted style={[styles.mt8, styles.small]}>
        Posisi Anda dikirim otomatis ke customer selama perjalanan.
      </BodyText>

      {next ? (
        <Button
          label={next.label}
          onPress={() => void orders.transition(next.next)}
          loading={orders.busy}
          style={styles.mt12}
        />
      ) : order.status === 'COMPLETED' ? (
        <BodyText style={[styles.completedText, styles.mt8]}>
          Order selesai. Menunggu settlement ke saldo…
        </BodyText>
      ) : null}

      {order.status !== 'COMPLETED' ? (
        <Button
          label="Batalkan Order"
          variant="danger"
          onPress={() => setCancelVisible(true)}
          disabled={orders.busy}
          style={styles.mt8}
        />
      ) : null}

      <CancelOrderModal
        visible={cancelVisible}
        onClose={() => setCancelVisible(false)}
        onSubmit={async (reason) => {
          setCancelVisible(false);
          await orders.cancelActiveOrder(reason);
        }}
      />
    </Card>
  );
}

/** Modal pembatalan lintas platform — Alert.prompt hanya tersedia di iOS. */
const CANCEL_REASONS = [
  'Keadaan darurat pribadi',
  'Kendala transportasi ke lokasi',
  'Lingkungan/lokasi tidak memungkinkan',
  'Alasan lain',
] as const;

function CancelOrderModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const reason = (selected ?? '') + (extra.trim() ? ` — ${extra.trim()}` : '');
  const valid = reason.trim().length >= 3;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable onPress={(e: GestureResponderEvent) => e.stopPropagation()} style={styles.modalCard}>
          <Card>
            <Heading size={18}>Batalkan Order</Heading>
            <BodyText muted style={styles.mt4}>
              Pilih alasan pembatalan — customer akan menerima notifikasi dan dana dikembalikan.
            </BodyText>
            <View style={styles.mt8}>
              {CANCEL_REASONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setSelected(r)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selected === r }}
                  style={styles.reasonRow}
                >
                  <View style={[styles.radio, selected === r && styles.radioSelected]} />
                  <BodyText>{r}</BodyText>
                </Pressable>
              ))}
            </View>
            {selected === 'Alasan lain' ? (
              <TextInput
                value={extra}
                onChangeText={setExtra}
                placeholder="Tuliskan alasan Anda (min 3 karakter)"
                placeholderTextColor={COLORS.textMuted}
                style={[styles.input, styles.mt8]}
                accessibilityLabel="Alasan pembatalan tambahan"
              />
            ) : null}
            <View style={styles.actionsRow}>
              <Button label="Batal" variant="outline" onPress={onClose} disabled={busy} style={styles.flex} />
              <View style={styles.gapH} />
              <Button
                label="Batalkan Order"
                variant="danger"
                disabled={!valid || busy}
                loading={busy}
                onPress={() => {
                  setBusy(true);
                  onSubmit(reason.trim()).finally(() => setBusy(false));
                }}
                style={styles.flex}
              />
            </View>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  radioSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  scroll: { padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  walletRow: { marginTop: 14, alignItems: 'flex-start' },
  sectionGap: { marginTop: 20, marginBottom: 10 },
  mt2: { marginTop: 2 },
  mt4: { marginTop: 4 },
  mt6: { marginTop: 6 },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  small: { fontSize: 12 },
  detailBox: { marginTop: 12 },
  priceRow: { marginTop: 12, flexDirection: 'row' },
  actionsRow: { flexDirection: 'row', marginTop: 12, alignItems: 'center' },
  gapH: { width: 10 },
  bidSentBox: {
    marginTop: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 10,
  },
  bidSentText: { fontSize: 14 },
  activeCard: { borderWidth: 1.5, borderColor: COLORS.primary },
  completedText: { color: COLORS.success, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { marginBottom: 40 },
  label: { fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
  },
});
