/** Saldo ledger; pencairan dinonaktifkan sampai payout tersedia. */
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useWalletStore } from '../state/wallet';
import {
  BodyText,
  Card,
  COLORS,
  ErrorBanner,
  Heading,
} from '../components/ui';
import { formatRupiah } from '../constants';
import type { WalletTransactionDto } from '@pijar/shared';


const TXN_LABEL: Record<string, string> = {
  TOPUP: 'Top Up',
  ORDER_PAYMENT: 'Pembayaran Order',
  ORDER_EARNING: 'Pendapatan Order',
  REFUND: 'Refund',
  WITHDRAWAL: 'Penarikan',
};

export function WalletScreen() {
  const wallet = useWalletStore();

  useEffect(() => {
    void wallet.refresh();
  }, [wallet.refresh]);


  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        data={wallet.transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TxnRow txn={item} />}
        onEndReached={() => void wallet.loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <>
            <Card style={styles.balanceCard}>
              <BodyText muted style={styles.small}>
                Saldo tersedia
              </BodyText>
              <Heading size={32}>{wallet.wallet ? formatRupiah(wallet.wallet.balance) : '—'}</Heading>

              <BodyText muted style={styles.label}>
                Penarikan saldo belum tersedia. Saldo ini belum merupakan transfer ke rekening bank.
              </BodyText>
            </Card>
            <ErrorBanner message={wallet.error} />
            <Heading size={18} style={styles.sectionGap}>
              Riwayat Transaksi
            </Heading>
            {wallet.transactions.length === 0 && !wallet.loading ? (
              <Card>
                <BodyText muted>Belum ada transaksi.</BodyText>
              </Card>
            ) : null}
          </>
        }
        ListFooterComponent={
          wallet.loading ? <ActivityIndicator color={COLORS.primary} style={styles.loader} /> : null
        }
      />
    </View>
  );
}

function TxnRow({ txn }: { txn: WalletTransactionDto }) {
  const isCredit = txn.type === 'ORDER_EARNING' || txn.type === 'TOPUP' || txn.type === 'REFUND';
  return (
    <Card style={styles.txnCard}>
      <View style={styles.txnRow}>
        <View style={styles.flex}>
          <BodyText style={styles.txnTitle}>
            {TXN_LABEL[txn.type] ?? txn.type}
          </BodyText>
          <BodyText muted style={styles.small}>
            {txn.description} • {new Date(txn.createdAt).toLocaleString('id-ID')}
          </BodyText>
        </View>
        <Heading size={16} style={{ color: isCredit ? COLORS.success : COLORS.danger }}>
          {isCredit ? '+' : '-'}
          {formatRupiah(txn.amount)}
        </Heading>
      </View>
      <BodyText muted style={[styles.small, styles.mt4]}>
        Saldo akhir: {formatRupiah(txn.balanceAfter)}
      </BodyText>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16 },
  balanceCard: { borderWidth: 1.5, borderColor: COLORS.primary },
  small: { fontSize: 12 },
  label: { fontSize: 13, marginBottom: 6, marginTop: 14 },
  mt4: { marginTop: 4 },
  sectionGap: { marginTop: 20, marginBottom: 10 },
  txnCard: { paddingVertical: 12 },
  txnRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  txnTitle: { fontWeight: '700', fontSize: 15 },
  loader: { marginVertical: 16 },
});
