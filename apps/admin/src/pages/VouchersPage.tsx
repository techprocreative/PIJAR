// Manajemen voucher: buat tunggal / bulk, edit, aktif-nonaktif.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bulkCreateVouchers, createVoucher, getVouchers, updateVoucher } from '../api/admin';
import { qk } from '../api/keys';
import { ApiError } from '../api/http';
import { DEFAULT_PAGE_SIZE } from '../constants';
import { formatDate, isoToLocalInput, localInputToIso } from '../format';
import type { VoucherBody, VoucherDto } from '../types';
import { EmptyState, ErrorState, PageHeader, Paginator, TableSkeleton } from '../components/ui';

interface FormState {
  code: string;
  type: 'PERCENT' | 'AMOUNT';
  value: string;
  minSpend: string;
  maxDiscount: string;
  validUntil: string;
  walletOnly: boolean;
  active: boolean;
}

function emptyForm(): FormState {
  return {
    code: '',
    type: 'AMOUNT',
    value: '',
    minSpend: '0',
    maxDiscount: '',
    validUntil: isoToLocalInput(),
    walletOnly: false,
    active: true,
  };
}

/** FormState → VoucherBody untuk API (validasi angka di sini, server juga memvalidasi). */
function formToBody(form: FormState): VoucherBody {
  const body: VoucherBody = {
    code: form.code.trim(),
    type: form.type,
    value: Number(form.value),
    minSpend: Number(form.minSpend || 0),
    validUntil: localInputToIso(form.validUntil),
    walletOnly: form.walletOnly,
    active: form.active,
  };
  if (form.maxDiscount.trim()) body.maxDiscount = Number(form.maxDiscount);
  return body;
}

export default function VouchersPage() {
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<VoucherDto | null>(null);
  const [bulkCodes, setBulkCodes] = useState('');
  const [bulkBase, setBulkBase] = useState<FormState>(emptyForm);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.vouchers(page, DEFAULT_PAGE_SIZE),
    queryFn: () => getVouchers(page, DEFAULT_PAGE_SIZE),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'vouchers'] });
  }

  const save = useMutation({
    mutationFn: (vars: { id: string | null; body: VoucherBody }) =>
      vars.id ? updateVoucher(vars.id, vars.body) : createVoucher(vars.body),
    onSuccess: () => {
      setForm(emptyForm());
      setEditing(null);
      refresh();
    },
  });

  /** Bulk: satu pengaturan, banyak kode (dipisah baris/koma). */
  const bulk = useMutation({
    mutationFn: (codes: string[]) =>
      bulkCreateVouchers(codes.map((code) => ({ ...formToBody(bulkBase), code }))),
    onSuccess: () => {
      setBulkCodes('');
      refresh();
    },
  });

  function startEdit(v: VoucherDto) {
    setEditing(v);
    setForm({
      code: v.code,
      type: v.type,
      value: String(v.value),
      minSpend: String(v.minSpend),
      maxDiscount: v.maxDiscount != null ? String(v.maxDiscount) : '',
      validUntil: isoToLocalInput(v.validUntil),
      walletOnly: v.walletOnly,
      active: v.active,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const saveError = save.isError ? (save.error as ApiError).message : null;
  const bulkError = bulk.isError ? (bulk.error as ApiError).message : null;

  return (
    <div>
      <PageHeader
        title="Voucher"
        description="Voucher diskon PERCENT / AMOUNT dengan batas minimal belanja & masa berlaku."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Form tunggal / edit */}
        <form
          className="card space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ id: editing?.id ?? null, body: formToBody(form) });
          }}
        >
          <div className="text-sm font-semibold text-slate-700">
            {editing ? `Edit voucher ${editing.code}` : 'Buat voucher'}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Kode</label>
              <input
                className="field-input uppercase"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                minLength={3}
                maxLength={32}
                required
              />
            </div>
            <div>
              <label className="field-label">Tipe</label>
              <select
                className="field-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as 'PERCENT' | 'AMOUNT' })}
              >
                <option value="AMOUNT">Nominal (Rp)</option>
                <option value="PERCENT">Persen (%)</option>
              </select>
            </div>
            <div>
              <label className="field-label">
                Nilai {form.type === 'PERCENT' ? '(1–100 %)' : '(Rp)'}
              </label>
              <input
                className="field-input"
                type="number"
                min={1}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="field-label">Minimal belanja (Rp)</label>
              <input
                className="field-input"
                type="number"
                min={0}
                value={form.minSpend}
                onChange={(e) => setForm({ ...form, minSpend: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Maks. diskon (opsional, Rp)</label>
              <input
                className="field-input"
                type="number"
                min={1}
                value={form.maxDiscount}
                onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Berlaku s.d.</label>
              <input
                className="field-input"
                type="datetime-local"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.walletOnly}
                onChange={(e) => setForm({ ...form, walletOnly: e.target.checked })}
              />
              Khusus wallet
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Aktif
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {editing ? 'Simpan perubahan' : 'Buat voucher'}
            </button>
            {editing ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm());
                }}
              >
                Batal edit
              </button>
            ) : null}
          </div>
          {saveError ? <div className="text-sm text-rose-600">{saveError}</div> : null}
        </form>

        {/* Form bulk */}
        <form
          className="card space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const codes = bulkCodes
              .split(/[\n,]+/)
              .map((c) => c.trim().toUpperCase())
              .filter((c) => c.length > 0);
            if (codes.length > 0) bulk.mutate(codes);
          }}
        >
          <div className="text-sm font-semibold text-slate-700">Bulk voucher</div>
          <p className="text-xs text-slate-500">
            Satu pengaturan berlaku untuk semua kode. Kode dipisah baris/koma.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Tipe</label>
              <select
                className="field-input"
                value={bulkBase.type}
                onChange={(e) =>
                  setBulkBase({ ...bulkBase, type: e.target.value as 'PERCENT' | 'AMOUNT' })
                }
              >
                <option value="AMOUNT">Nominal (Rp)</option>
                <option value="PERCENT">Persen (%)</option>
              </select>
            </div>
            <div>
              <label className="field-label">
                Nilai {bulkBase.type === 'PERCENT' ? '(%)' : '(Rp)'}
              </label>
              <input
                className="field-input"
                type="number"
                min={1}
                value={bulkBase.value}
                onChange={(e) => setBulkBase({ ...bulkBase, value: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="field-label">Minimal belanja (Rp)</label>
              <input
                className="field-input"
                type="number"
                min={0}
                value={bulkBase.minSpend}
                onChange={(e) => setBulkBase({ ...bulkBase, minSpend: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Berlaku s.d.</label>
              <input
                className="field-input"
                type="datetime-local"
                value={bulkBase.validUntil}
                onChange={(e) => setBulkBase({ ...bulkBase, validUntil: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className="field-label">Daftar kode</label>
            <textarea
              className="field-input h-24 font-mono uppercase"
              placeholder={'PIJAR10\nPIJAR20\nPIJARNEWYEAR'}
              value={bulkCodes}
              onChange={(e) => setBulkCodes(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={bulk.isPending}>
            Buat semua voucher
          </button>
          {bulkError ? <div className="text-sm text-rose-600">{bulkError}</div> : null}
        </form>
      </div>

      {/* Daftar voucher */}
      <div className="card mt-6 overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : isError ? (
          <ErrorState message={error instanceof ApiError ? error.message : 'Gagal memuat data'} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState message="Belum ada voucher." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Diskon</th>
                  <th className="px-4 py-3">Min. belanja</th>
                  <th className="px-4 py-3">Berlaku s.d.</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-800">{v.code}</td>
                    <td className="px-4 py-3">
                      {v.type === 'PERCENT' ? `${v.value}%` : `Rp${v.value.toLocaleString('id-ID')}`}
                      {v.maxDiscount != null ? (
                        <span className="text-xs text-slate-400">
                          {' '}
                          (maks Rp{v.maxDiscount.toLocaleString('id-ID')})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">Rp{v.minSpend.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-xs">{formatDate(v.validUntil)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          v.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {v.active ? 'aktif' : 'nonaktif'}
                      </span>
                      {v.walletOnly ? (
                        <span className="ml-1 text-xs text-slate-400">· wallet</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="btn-secondary" onClick={() => startEdit(v)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data ? (
          <Paginator page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />
        ) : null}
      </div>
    </div>
  );
}
