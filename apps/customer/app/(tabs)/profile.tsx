import { Link } from 'expo-router';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useEffect } from 'react';
import { Card, Divider, Row, Typography, COLORS } from '../../src/components/ui';
import { rupiah } from '../../src/lib/format';
import { useAuth } from '../../src/store/auth';
import { useWallet } from '../../src/store/catalog';

type TxnType = 'TOPUP' | 'ORDER_PAYMENT' | 'ORDER_EARNING' | 'REFUND' | 'WITHDRAWAL';

const TXN_LABEL: Record<TxnType, string> = {
  TOPUP: 'Top-up saldo',
  ORDER_PAYMENT: 'Pembayaran pesanan',
  ORDER_EARNING: 'Penghasilan',
  REFUND: 'Refund',
  WITHDRAWAL: 'Penarikan',
};

export default function Profile() {
  const user = useAuth((s) => s.user);
  const session = useAuth((s) => s.session);
  const logout = useAuth((s) => s.logout);
  const wallet = useWallet((s) => s.wallet);
  const transactions = useWallet((s) => s.transactions);
  const loading = useWallet((s) => s.loading);
  const error = useWallet((s) => s.error);
  const fetchWallet = useWallet((s) => s.fetchWallet);

  useEffect(() => {
    if (session?.accessToken) void fetchWallet().catch(() => undefined);
  }, [session?.accessToken, fetchWallet]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
    >
      <Card>
        <Typography variant="h1">{user?.name ?? 'Pelanggan PIJAR'}</Typography>
        <Typography variant="muted" style={{ marginTop: 4 }}>
          {user?.phone ?? '-'}
        </Typography>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <Typography variant="body">Saldo dompet</Typography>
          <Typography variant="h2" style={{ color: COLORS.primaryDark }}>
            {wallet ? rupiah(wallet.balance) : loading ? 'Memuat…' : 'Belum tersedia'}
          </Typography>
        </Row>
        {error ? <Typography variant="small" style={{ color: COLORS.danger }}>{error}</Typography> : null}
        <Typography variant="small" style={{ marginTop: 8 }}>
          Top-up saat ini dikelola admin (MVP). Pembayaran pesanan otomatis terpotong dari dompet saat
          tawaran diterima.
        </Typography>
      </Card>

      <Typography variant="h2">Riwayat Dompet</Typography>
      {loading && transactions.length === 0 ? <Typography variant="muted">Memuat…</Typography> : null}
      {!loading && !error && transactions.length === 0 ? (
        <Typography variant="muted">Belum ada transaksi dompet.</Typography>
      ) : null}
      <View style={{ gap: 10 }}>
        {transactions.map((t) => {
          // Tipe dari kontrak shared; fallback bila server mengirim nilai baru.
          const label = TXN_LABEL[t.type as TxnType] ?? t.type;
          const isDebit = t.type === 'ORDER_PAYMENT' || t.type === 'WITHDRAWAL';
          return (
            <Card key={t.id} style={{ padding: 14 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Typography variant="body">{label}</Typography>
                <Typography
                  variant="body"
                  style={{ fontWeight: '800', color: isDebit ? COLORS.danger : COLORS.success }}
                >
                  {isDebit ? '-' : '+'}
                  {rupiah(t.amount)}
                </Typography>
              </Row>
              <Typography variant="small" style={{ marginTop: 4 }}>
                {t.description} · sisa {rupiah(t.balanceAfter)}
              </Typography>
            </Card>
          );
        })}
      </View>

      <Pressable onPress={() => void logout().catch((error: unknown) => Alert.alert('Gagal menghapus sesi tersimpan', error instanceof Error ? error.message : 'Silakan coba kembali'))}>
        <Card style={{ alignItems: 'center', borderColor: COLORS.danger }}>
          <Typography variant="body" style={{ color: COLORS.danger, fontWeight: '700' }}>
            Keluar
          </Typography>
        </Card>
      </Pressable>
      <Link href="/login" asChild>
        <Pressable>
          <Typography variant="small" style={{ textAlign: 'center', marginTop: 8 }}>
            Ganti akun
          </Typography>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
