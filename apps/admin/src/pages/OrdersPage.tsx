// Overview semua order: filter status + paginasi; refresh realtime via room admin.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOrdersOverview } from '../api/admin';
import { qk } from '../api/keys';
import { DEFAULT_PAGE_SIZE } from '../constants';
import { formatDateTime, formatIdr } from '../format';
import { ORDER_STATUSES } from '../types';
import { EmptyState, PageHeader, Paginator, StatusBadge, TableSkeleton } from '../components/ui';

export default function OrdersPage() {
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: qk.orders(status || undefined, page, DEFAULT_PAGE_SIZE),
    queryFn: () =>
      getOrdersOverview({ status: status || undefined, page, limit: DEFAULT_PAGE_SIZE }),
  });

  function changeStatus(next: string) {
    setStatus(next);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Semua order lintas status — update status masuk real-time via WebSocket."
        actions={
          <select
            className="field-input w-48"
            value={status}
            onChange={(e) => changeStatus(e.target.value)}
          >
            <option value="">Semua status</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        }
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState message="Tidak ada order pada filter ini." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Layanan</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mitra</th>
                  <th className="px-4 py-3">Harga</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Dibuat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{o.serviceName}</div>
                      <div className="font-mono text-xs text-slate-400">{o.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{o.customer.name}</div>
                      <div className="text-xs text-slate-400">{o.customer.phone}</div>
                    </td>
                    <td className="px-4 py-3">{o.mitraName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div>{formatIdr(o.finalPrice ?? o.customerPrice)}</div>
                      {o.finalPrice != null && o.finalPrice !== o.customerPrice ? (
                        <div className="text-xs text-slate-400">tawaran {formatIdr(o.customerPrice)}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(o.createdAt)}</td>
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
