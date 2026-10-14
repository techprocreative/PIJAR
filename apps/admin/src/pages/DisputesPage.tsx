// Daftar dispute + resolusi (alasan + keputusan admin).

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDisputes, resolveDispute } from '../api/admin';
import { qk } from '../api/keys';
import { ApiError } from '../api/http';
import { DEFAULT_PAGE_SIZE } from '../constants';
import { formatDateTime } from '../format';
import { EmptyState, ErrorState, PageHeader, Paginator, StatusBadge, TableSkeleton } from '../components/ui';

type StatusFilter = 'OPEN' | 'RESOLVED' | undefined;

export default function DisputesPage() {
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [page, setPage] = useState(1);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.disputes(status, page, DEFAULT_PAGE_SIZE),
    queryFn: () => getDisputes({ status, page, limit: DEFAULT_PAGE_SIZE }),
  });

  const resolve = useMutation({
    mutationFn: (vars: { id: string; resolution: string }) => resolveDispute(vars.id, vars.resolution),
    onSuccess: () => {
      setResolvingId(null);
      setResolution('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
    },
  });

  function changeFilter(next: StatusFilter) {
    setStatus(next);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Dispute"
        description="Sengketa order yang dibuka customer/mitra — tulis resolusi untuk menutup."
        actions={
          <div className="flex gap-2">
            {(['OPEN', 'RESOLVED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => changeFilter(status === s ? undefined : s)}
                className={
                  status === s
                    ? 'rounded-lg bg-pijar-600 px-3 py-1.5 text-sm font-semibold text-white'
                    : 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50'
                }
              >
                {s === 'OPEN' ? 'Terbuka' : 'Selesai'}
              </button>
            ))}
          </div>
        }
      />

      <div className="card">
        {isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : isError ? (
          <ErrorState message={error instanceof ApiError ? error.message : 'Gagal memuat data'} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState message="Tidak ada dispute pada filter ini." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.data.map((d) => (
              <li key={d.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{d.id.slice(0, 8)}</span>
                      <StatusBadge status={d.status} />
                      <span className="text-xs text-slate-500">
                        dibuka oleh {d.openedByRole === 'CUSTOMER' ? 'customer' : 'mitra'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-800">{d.reason}</p>
                    {d.resolution ? (
                      <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        Resolusi: {d.resolution}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs text-slate-400">{formatDateTime(d.createdAt)}</span>
                    {d.status === 'OPEN' && resolvingId !== d.id ? (
                      <button
                        className="btn-secondary"
                        onClick={() => setResolvingId(d.id)}
                      >
                        Selesaikan
                      </button>
                    ) : null}
                  </div>
                </div>

                {d.status === 'OPEN' && resolvingId === d.id ? (
                  <form
                    className="mt-3 flex flex-col gap-2 sm:flex-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      resolve.mutate({ id: d.id, resolution: resolution.trim() });
                    }}
                  >
                    <input
                      className="field-input flex-1"
                      placeholder="Resolusi (mis. refund penuh ke customer)"
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      minLength={3}
                      required
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setResolvingId(null);
                          setResolution('');
                        }}
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={resolve.isPending || resolution.trim().length < 3}
                      >
                        Simpan
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {data ? (
          <Paginator page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />
        ) : null}
      </div>

      {resolve.isError ? (
        <div className="mt-3 text-sm text-rose-600">
          {(resolve.error as ApiError).message ?? 'Gagal menyimpan resolusi'}
        </div>
      ) : null}
    </div>
  );
}
