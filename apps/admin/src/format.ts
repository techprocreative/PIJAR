// Format helper: rupiah, tanggal (locale id-ID), dsb.

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function formatIdr(value: number | null | undefined): string {
  if (value == null) return '—';
  return idr.format(value);
}

const dt = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return dt.format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(d);
}

/** Tanggal input <input type="datetime-local"> (YYYY-MM-DDTHH:mm) dari ISO. */
export function isoToLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 30 * 24 * 3600 * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Input datetime-local → ISO untuk body API. */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}
