import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useEffect } from 'react';
import { useRouter, Link } from 'expo-router';
import { OrderDto } from '@pijar/shared';
import { Badge, Card, COLORS, Divider, Row, STATUS_COLOR, Typography } from '../../src/components/ui';
import { rupiah, STATUS_LABEL, formatDateTime } from '../../src/lib/format';
import { useOrders } from '../../src/store/orders';

export default function Orders() {
  const myOrders = useOrders((s) => s.myOrders);
  const loading = useOrders((s) => s.loadingMyOrders);
  const loadError = useOrders((s) => s.myOrdersError);
  const fetchMyOrders = useOrders((s) => s.fetchMyOrders);
  const router = useRouter();

  useEffect(() => {
    void fetchMyOrders().catch(() => undefined);
  }, [fetchMyOrders]);

  const renderItem = ({ item }: { item: OrderDto }) => (
    <Link href={{ pathname: '/order/[id]', params: { id: item.id } }} asChild>
      <Pressable>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Typography variant="h2" style={{ flexShrink: 1 }}>
              {item.service.name}
            </Typography>
            <Badge label={STATUS_LABEL[item.status]} color={STATUS_COLOR[item.status] ?? COLORS.info} />
          </Row>
          <Divider />
          <Typography variant="muted">Dibuat: {formatDateTime(item.createdAt)}</Typography>
          <Typography variant="muted">Alamat: {item.address.label}</Typography>
          <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <Typography variant="small">
              {item.matchedMitra ? `Terapis: ${item.matchedMitra.name}` : 'Belum ada terapis'}
            </Typography>
            <Typography variant="body" style={{ fontWeight: '700' }}>
              {rupiah(item.finalPrice ?? item.customerPrice)}
            </Typography>
          </Row>
        </Card>
      </Pressable>
    </Link>
  );

  if (!loading && loadError && myOrders.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <Typography variant="h2">Gagal memuat pesanan</Typography>
        <Typography variant="muted" style={{ textAlign: 'center' }}>
          {loadError}
        </Typography>
      </View>
    );
  }


  return (
    <FlatList
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={myOrders}
      keyExtractor={(o) => o.id}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void fetchMyOrders().catch(() => undefined)} />}
    />
  );
}
