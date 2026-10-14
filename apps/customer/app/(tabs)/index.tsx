import { Link } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useEffect } from 'react';
import { ServiceDto } from '@pijar/shared';
import { Badge, Button, Card, COLORS, Divider, Row, STATUS_COLOR, Typography } from '../../src/components/ui';
import { rupiah, STATUS_LABEL, formatDateTime } from '../../src/lib/format';
import { useServices, useWallet } from '../../src/store/catalog';
import { useOrders } from '../../src/store/orders';
import { useRouter } from 'expo-router';

export default function Home() {
  const services = useServices((s) => s.services);
  const fetchServices = useServices((s) => s.fetchServices);
  const wallet = useWallet((s) => s.wallet);
  const fetchWallet = useWallet((s) => s.fetchWallet);
  const walletLoading = useWallet((s) => s.loading);
  const walletError = useWallet((s) => s.error);
  const loadingOrders = useOrders((s) => s.loadingMyOrders);
  const activeOrder = useOrders((s) => s.activeOrder);
  const fetchMyOrders = useOrders((s) => s.fetchMyOrders);
  const router = useRouter();

  useEffect(() => {
    void fetchServices();
    void fetchMyOrders().catch(() => undefined);
  }, [fetchServices, fetchMyOrders]);

  const renderService = ({ item }: { item: ServiceDto }) => (
    <Pressable
      onPress={() => router.push({ pathname: '/order/new', params: { serviceId: item.id } })}
      style={({ pressed }) => ({
        backgroundColor: pressed ? '#FFF7ED' : COLORS.card,
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
      })}
    >
      <Typography variant="h2">{item.name}</Typography>
      <Typography variant="muted" style={{ marginTop: 4 }}>
        {item.description}
      </Typography>
      <Row style={{ justifyContent: 'space-between', marginTop: 12 }}>
        <Typography variant="small">{item.durationMinutes} menit</Typography>
        <Text style={{ color: COLORS.primaryDark, fontWeight: '800', fontSize: 16 }}>
          {rupiah(item.basePrice)}
        </Text>
      </Row>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={loadingOrders || walletLoading} onRefresh={() => {
        void fetchMyOrders().catch(() => undefined);
        void fetchWallet().catch(() => undefined);
      }} />}
    >
      <>
        <Card style={{ backgroundColor: COLORS.primary, borderColor: COLORS.primary }}>
          <Typography variant="small" style={{ color: '#FFEDD5' }}>
            Saldo PIJAR
          </Typography>
          <Typography variant="h1" style={{ color: '#fff' }}>
            {wallet ? rupiah(wallet.balance) : walletLoading ? 'Memuat…' : 'Belum tersedia'}
          </Typography>
        </Card>
        {walletError ? <Typography variant="small" style={{ color: COLORS.danger }}>{walletError}</Typography> : null}
      </>

      {activeOrder ? (
        <Link href={{ pathname: '/order/[id]', params: { id: activeOrder.id } }} asChild>
          <Pressable>
            <Card style={{ borderColor: STATUS_COLOR[activeOrder.status] ?? COLORS.border }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Typography variant="h2">{activeOrder.service.name}</Typography>
                <Badge
                  label={STATUS_LABEL[activeOrder.status]}
                  color={STATUS_COLOR[activeOrder.status] ?? COLORS.info}
                />
              </Row>
              <Divider />
              <Typography variant="muted">
                Terapis: {activeOrder.matchedMitra?.name ?? 'menunggu tawaran…'}
              </Typography>
              {activeOrder.bids.length > 0 && activeOrder.status === 'BIDDING' ? (
                <Typography variant="small" style={{ color: COLORS.primaryDark, marginTop: 4 }}>
                  {activeOrder.bids.length} tawaran masuk — ketuk untuk memilih
                </Typography>
              ) : null}
            </Card>
          </Pressable>
        </Link>
      ) : null}

      <Typography variant="h2">Layanan Pijat</Typography>
      <FlatList
        data={services}
        keyExtractor={(s) => s.id}
        renderItem={renderService}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      <Button
        title="+ Pesan Pijat Sekarang"
        onPress={() => router.push('/order/new')}
        style={{ marginTop: 4 }}
      />
    </ScrollView>
  );
}
