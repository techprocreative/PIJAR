// Penyesuaian saldo ledger oleh admin; bukan pembayaran atau pencairan dana.

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adjustWallet } from '../api/admin';
import { ApiError } from '../api/http';
import { formatDateTime, formatIdr } from '../format';
import type { WalletTransactionDto } from '../types';
import { PageHeader } from '../components/ui';

export default function WalletPage() {
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [lastTxn, setLastTxn] = useState<WalletTransactionDto | null>(null);

  const adjust = useMutation({
    mutationFn: (vars: { userId: string; amount: number; description: string }) =>
      adjustWallet(vars.userId, vars.amount, vars.description),
    onSuccess: (txn) => {
      setLastTxn(txn);
      setUserId('');
      setAmount('');
      setDescription('');
    },
  });

  const error = adjust.isError ? (adjust.error as ApiError).message : null;

  return (
    <div>
      <PageHeader
        title="Wallet Adjust"
        description="Penyesuaian saldo manual tercatat sebagai TOPUP di ledger. Payment gateway dan pencairan dana belum tersedia; transaksi ini bukan bukti transfer bank."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          className="card space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const nominal = Number(amount);
            if (!window.confirm(`Tambahkan saldo ${formatIdr(nominal)} ke user ${userId.trim()}? Tindakan ini langsung tercatat di ledger.`)) return;
            setLastTxn(null);
            adjust.mutate({
              userId: userId.trim(),
              amount: nominal,
              description: description.trim(),
            });
          }}
        >
          <div>
            <label htmlFor="wallet-user-id" className="field-label">User ID</label>
            <input
              id="wallet-user-id"
              className="field-input font-mono"
              placeholder="uuid user (customer/mitra)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="wallet-amount" className="field-label">Nominal (Rp)</label>
            <input
              id="wallet-amount"
              className="field-input"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="wallet-desc" className="field-label">Deskripsi</label>
            <input
              id="wallet-desc"
              className="field-input"
              placeholder="mis. kompensasi refund order #123"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={3}
              maxLength={200}
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={adjust.isPending}>
            {adjust.isPending ? 'Memproses…' : 'Sesuaikan saldo'}
          </button>
          {error ? <div className="text-sm text-rose-600">{error}</div> : null}
        </form>

        <div className="card p-4">
          <div className="text-sm font-semibold text-slate-700">Transaksi terakhir</div>
          {lastTxn ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">ID</dt>
                <dd className="truncate font-mono text-xs text-slate-700">{lastTxn.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Tipe</dt>
                <dd className="font-semibold text-slate-800">{lastTxn.type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Nominal</dt>
                <dd className="font-semibold text-emerald-700">{formatIdr(lastTxn.amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Saldo setelahnya</dt>
                <dd className="font-semibold text-slate-800">{formatIdr(lastTxn.balanceAfter)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Deskripsi</dt>
                <dd className="truncate text-right text-slate-700">{lastTxn.description}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Waktu</dt>
                <dd className="text-slate-700">{formatDateTime(lastTxn.createdAt)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-400">
              Belum ada penyesuaian pada sesi ini. Hasil transaksi akan tampil di sini.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
