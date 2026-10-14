import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, COLORS, Divider, Row, Typography } from '../../../src/components/ui';
import { api, ApiError } from '../../../src/lib/api';
import { useOrders } from '../../../src/store/orders';

export default function RateOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orders = useOrders((s) => s.myOrders);
  const fetchOrder = useOrders((s) => s.fetchOrder);
  const router = useRouter();

  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const order = orders.find((o) => o.id === id) ?? null;

  useEffect(() => {
    if (id) void fetchOrder(id).catch(() => undefined);
  }, [id, fetchOrder]);

  async function submit() {
    if (!id) return;
    if (stars < 1) return setError('Pilih 1–5 bintang');
    setBusy(true);
    setError(null);
    try {
      await api('/ratings', {
        method: 'POST',
        body: JSON.stringify({ orderId: id, stars, toRole: 'MITRA', ...(comment.trim() ? { comment: comment.trim() } : {}) }),
      });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.display : 'Gagal mengirim rating');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Typography variant="h2">Rating Terapis</Typography>
        <Typography variant="muted" style={{ marginTop: 4 }}>
          {order ? order.service.name : 'Pesanan'}
          {order?.matchedMitra ? ` — ${order.matchedMitra.name}` : ''}
        </Typography>
        <Divider />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 16 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setStars(n)}>
              <Text style={{ fontSize: 40, color: n <= stars ? '#FACC15' : COLORS.border }}>★</Text>
            </Pressable>
          ))}
        </View>
        <Row style={{ justifyContent: 'center' }}>
          <Badge label={stars > 0 ? `${stars} bintang` : 'Belum dipilih'} color={COLORS.primary} />
        </Row>
      </Card>

      <Card>
        <Typography variant="muted">Komentar (opsional)</Typography>
        <View
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 10,
            padding: 10,
            backgroundColor: '#fff',
          }}
        >
          <TextInput multiline value={comment} onChangeText={setComment} placeholder="Bagaimana pengalanan Anda?" placeholderTextColor={COLORS.textMuted} style={{ color: COLORS.text, minHeight: 80 }} />
        </View>
      </Card>

      {error ? <Typography variant="body" style={{ color: COLORS.danger }}>{error}</Typography> : null}
      <Button title="Kirim Rating" onPress={() => void submit()} loading={busy} />
      <View style={{ height: 16 }} />
    </ScrollView>
  );
}
