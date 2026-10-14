import { create } from 'zustand';
import type { ServiceDto, WalletDto, WalletTransactionDto } from '@pijar/shared';
import { Alert } from 'react-native';
import { api, ApiError } from '../lib/api';
import { useAuth } from './auth';
import { realtime } from '../lib/realtime';

interface ServiceState {
  services: ServiceDto[];
  loading: boolean;
  error: string | null;
  fetchServices: () => Promise<void>;
}

interface WalletState {
  wallet: WalletDto | null;
  transactions: WalletTransactionDto[];
  loading: boolean;
  error: string | null;
  fetchWallet: () => Promise<void>;
  setBalance: (balance: number) => void;
}

export const useServices = create<ServiceState>((set) => ({
  services: [],
  loading: false,
  error: null,
  fetchServices: async () => {
    set({ loading: true, error: null });
    try {
      const services = await api<ServiceDto[]>('/services', { skipAuth: true });
      set({ services });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Gagal memuat layanan' });
    } finally {
      set({ loading: false });
    }
  },
}));

export const useWallet = create<WalletState>((set) => ({
  wallet: null,
  transactions: [],
  loading: false,
  error: null,
  fetchWallet: async () => {
    set({ loading: true, error: null });
    try {
      const wallet = await api<WalletDto>('/wallet');
      set({ wallet });
      const page = await api<{ data: WalletTransactionDto[]; total: number }>(
        '/wallet/transactions?limit=30',
      );
      set({ transactions: page.data });
    } catch (error) {
      const message = error instanceof ApiError ? error.display : error instanceof Error ? error.message : 'Gagal memuat dompet';
      set({ error: message });
      Alert.alert('Gagal memuat dompet', message);
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  setBalance(balance) {
    set({ wallet: { balance, currency: 'IDR' } });
  },
}));

// Wallet ter-update realtime (settlement earning / order payment) → sinkron saldo.
realtime.on('wallet:updated', (data) => {
  if (data !== null && typeof data === 'object' && 'balance' in data && typeof data.balance === 'number') {
    useWallet.getState().setBalance(data.balance);
  }
});

realtime.onReconnect(() => useWallet.getState().fetchWallet());
useAuth.subscribe((state, previous) => {
  if (state.sessionVersion !== previous.sessionVersion) {
    useWallet.setState({ wallet: null, transactions: [], loading: false, error: null });
  }
});
