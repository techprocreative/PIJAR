// Antrian verifikasi mitra: lihat dokumen (KTP/sertifikat), setujui / tolak.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decideVerification, getPendingVerifications } from '../api/admin';
import { qk } from '../api/keys';
import { ApiError } from '../api/http';
import { DEFAULT_PAGE_SIZE } from '../constants';
import { formatDate } from '../format';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Paginator,
  StatusBadge,
  TableSkeleton,
} from '../components/ui';

export default function VerificationsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.verifications(page, DEFAULT_PAGE_SIZE),
    queryFn: () => getPendingVerifications(page, DEFAULT_PAGE_SIZE),
  });

  const decide = useMutation({
    mutationFn: (vars: { mitraId: string; decision: 'VERIFIED' | 'REJECTED' }) =>
      decideVerification(vars.mitraId, vars.decision),
    onSuccess: () => {
      // Halaman bisa kosong setelah keputusan → cek ulang dari halaman 1 bila perlu.
      queryClient.invalidateQueries({ queryKey: ['admin', 'verifications'] });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
    },
  });

  return (
    <div>
      <PageHeader
        title="Verifikasi Mitra"
        description="Periksa dokumen (KTP, sertifikat) lalu setujui atau tolak pendaftaran terapis."
      />

      <div className="card">
        {isLoading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : isError ? (
          <ErrorState message={error instanceof ApiError ? error.message : 'Gagal memuat data'} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState message="Tidak ada mitra menunggu verifikasi 🎉" />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.data.map((m) => (
              <div key={m.mitraId} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{m.name}</span>
                      <StatusBadge status={m.status} />
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {m.phone} · {m.gender === 'MALE' ? 'Pria' : 'Wanita'} · diajukan{' '}
                      {formatDate(m.submittedAt)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-danger"
                      disabled={decide.isPending}
                      onClick={() => {
                        if (m.documents.length === 0 && !window.confirm('Belum ada dokumen yang diunggah. Tolak pendaftaran ini tanpa dokumen?')) return;
                        decide.mutate({ mitraId: m.mitraId, decision: 'REJECTED' });
                      }}
                    >
                      Tolak
                    </button>
                    <button
                      className="btn-primary"
                      disabled={decide.isPending}
                      onClick={() => {
                        if (m.documents.length === 0 && !window.confirm('Belum ada dokumen yang diunggah. Setujui pendaftaran tanpa dokumen?')) return;
                        decide.mutate({ mitraId: m.mitraId, decision: 'VERIFIED' });
                      }}
                    >
                      Setujui
                    </button>
                  </div>
                </div>

                {m.documents.length > 0 ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {m.documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-pijar-300 hover:bg-pijar-50"
                      >
                        <div className="font-medium">📄 {doc.type}</div>
                        <div className="text-xs text-slate-400">
                          {doc.expiresAt ? `berlaku s.d. ${formatDate(doc.expiresAt)}` : 'tanpa masa berlaku'}
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-slate-400">Belum ada dokumen diunggah.</div>
                )}
              </div>
            ))}
          </div>
        )}
        {data ? (
          <Paginator
            page={data.page}
            limit={data.limit}
            total={data.total}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      {decide.isError ? (
        <div className="mt-3 text-sm text-rose-600">
          {(decide.error as ApiError).message ?? 'Gagal memproses keputusan'}
        </div>
      ) : null}
    </div>
  );
}
