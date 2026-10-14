/**
 * Wallet store — saldo mitra + riwayat transaksi.
 * Event `wallet:updated` (WS) memicu refresh; settlement COMPLETED juga.
 */
import { create } from 'zustand';
import type { WalletDto, WalletTransactionDto } from '@pijar/shared';
import { getWallet, listWalletTransactions } from '../api/client';
import { currentUserId } from './auth';

interface WalletState {
  wallet: WalletDto | null;
  transactions: WalletTransactionDto[];
  total: number;
  page: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  transactions: [],
  total: 0,
  page: 1,
  loading: false,
  error: null,

  async refresh() {
    if (get().loading) return;
    const userId = currentUserId();
    set({ loading: true, error: null });
    try {
      const [wallet, firstPage] = await Promise.all([
        getWallet(),
        listWalletTransactions(1, 20),
      ]);
      if (currentUserId() !== userId) return;
      set({
        wallet,
        transactions: firstPage.data,
        total: firstPage.total,
        page: 1,
        loading: false,
      });
    } catch (err) {
      if (currentUserId() === userId) set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  async loadMore() {
    const { page, total, transactions, loading } = get();
    if (loading || transactions.length >= total) return;
    const userId = currentUserId();
    set({ loading: true });
    try {
      const next = await listWalletTransactions(page + 1, 20);
      if (currentUserId() !== userId) return;
      set({
        transactions: [...transactions, ...next.data],
        total: next.total,
        page: page + 1,
        loading: false,
      });
    } catch (err) {
      if (currentUserId() === userId) set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
