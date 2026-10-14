// Manajemen promo banner (tampilan app customer): buat, edit, aktif/nonaktif.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBanner, getBanners, updateBanner } from '../api/admin';
import { qk } from '../api/keys';
import { ApiError } from '../api/http';
import { DEFAULT_PAGE_SIZE } from '../constants';
import type { BannerBody, PromoBannerDto } from '../types';
import { EmptyState, ErrorState, PageHeader, Paginator, TableSkeleton } from '../components/ui';

interface FormState {
  title: string;
  imageUrl: string;
  linkUrl: string;
  active: boolean;
}

function emptyForm(): FormState {
  return { title: '', imageUrl: '', linkUrl: '', active: true };
}

export default function BannersPage() {
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<PromoBannerDto | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.banners(page, DEFAULT_PAGE_SIZE),
    queryFn: () => getBanners(page, DEFAULT_PAGE_SIZE),
  });

  const save = useMutation({
    mutationFn: (vars: { id: string | null; body: BannerBody }) =>
      vars.id ? updateBanner(vars.id, vars.body) : createBanner(vars.body),
    onSuccess: () => {
      setForm(emptyForm());
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] });
    },
  });

  function startEdit(b: PromoBannerDto) {
    setEditing(b);
    setForm({
      title: b.title,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl ?? '',
      active: b.active,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const saveError = save.isError ? (save.error as ApiError).message : null;

  return (
    <div>
      <PageHeader
        title="Promo Banner"
        description="Banner promo yang tampil di home app customer."
      />

      <form
        className="card mb-6 space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const body: BannerBody = {
            title: form.title.trim(),
            imageUrl: form.imageUrl.trim(),
            active: form.active,
          };
          if (form.linkUrl.trim()) body.linkUrl = form.linkUrl.trim();
          save.mutate({ id: editing?.id ?? null, body });
        }}
      >
        <div className="text-sm font-semibold text-slate-700">
          {editing ? `Edit banner "${editing.title}"` : 'Buat banner'}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">Judul</label>
            <input
              className="field-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              minLength={3}
              maxLength={100}
              required
            />
          </div>
          <div>
            <label className="field-label">URL gambar</label>
            <input
              className="field-input"
              type="url"
              placeholder="https://…"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Link tujuan (opsional)</label>
            <input
              className="field-input"
              type="url"
              placeholder="https://…"
              value={form.linkUrl}
              onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Aktif
        </label>

        {/* Preview gambar saat membuat/mengedit */}
        {form.imageUrl ? (
          <img
            src={form.imageUrl}
            alt="Preview banner"
            className="h-28 w-full rounded-lg object-cover"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        ) : null}

        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {editing ? 'Simpan perubahan' : 'Buat banner'}
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

      <div className="card overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : isError ? (
          <ErrorState message={error instanceof ApiError ? error.message : 'Gagal memuat data'} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState message="Belum ada banner." />
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((b) => (
              <div key={b.id} className="overflow-hidden rounded-lg border border-slate-200">
                <img
                  src={b.imageUrl}
                  alt={b.title}
                  className="h-32 w-full bg-slate-100 object-cover"
                  loading="lazy"
                />
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{b.title}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        b.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {b.active ? 'aktif' : 'nonaktif'}
                    </span>
                  </div>
                  {b.linkUrl ? (
                    <a
                      href={b.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-sky-600 hover:underline"
                    >
                      {b.linkUrl}
                    </a>
                  ) : null}
                  <button className="btn-secondary w-full" onClick={() => startEdit(b)}>
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {data ? (
          <Paginator page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />
        ) : null}
      </div>
    </div>
  );
}
