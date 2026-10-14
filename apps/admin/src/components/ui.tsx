// Komponen kecil bersama: badge status, state kosong/error, paginasi.

import type { ReactNode } from 'react';

/** Warna badge per status order / dispute / mitra. */
const STATUS_BADGE_CLASSES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  BIDDING: 'bg-amber-100 text-amber-800',
  MATCHED: 'bg-sky-100 text-sky-800',
  MITRA_ON_THE_WAY: 'bg-sky-100 text-sky-800',
  ARRIVED: 'bg-indigo-100 text-indigo-800',
  IN_PROGRESS: 'bg-violet-100 text-violet-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  SETTLED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-rose-100 text-rose-800',
  OPEN: 'bg-rose-100 text-rose-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
  PENDING: 'bg-amber-100 text-amber-800',
  VERIFIED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
  EXPIRED: 'bg-slate-200 text-slate-600',
  OFFLINE: 'bg-slate-100 text-slate-600',
  ONLINE: 'bg-emerald-100 text-emerald-800',
  ON_DUTY: 'bg-sky-100 text-sky-800',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_BADGE_CLASSES[status] ?? 'bg-slate-100 text-slate-700'
      }`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
      <span className="text-3xl">📭</span>
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-rose-500">
      <span className="text-3xl">⚠️</span>
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-5 flex-1 animate-pulse rounded bg-slate-200" />
          ))}
        </div>
      ))}
    </div>
  );
}

interface PaginatorProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Paginator({ page, limit, total, onPageChange }: PaginatorProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span>
        Halaman {page} / {totalPages} — {total} data
      </span>
      <div className="flex gap-2">
        <button
          className="btn-secondary"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
        >
          ← Sebelumnya
        </button>
        <button className="btn-secondary" disabled={!canNext} onClick={() => onPageChange(page + 1)}>
          Berikutnya →
        </button>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
