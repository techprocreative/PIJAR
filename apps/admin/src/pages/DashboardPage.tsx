// Dashboard: kartu ringkasan AdminDashboardDto + feed aktivitas realtime (WS room admin).

import { useQuery } from '@tanstack/react-query';
import { getDashboard, getOrdersOverview } from '../api/admin';
import { qk } from '../api/keys';
import { formatIdr } from '../format';
import { PageHeader, StatusBadge, TableSkeleton } from '../components/ui';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  tone: 'pijar' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet';
}

const TONE_CLASSES: Record<StatCardProps['tone'], string> = {
  pijar: 'bg-pijar-50 text-pijar-700',
  sky: 'bg-sky-50 text-sky-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  violet: 'bg-violet-50 text-violet-700',
};

function StatCard({ label, value, icon, tone }: StatCardProps) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${TONE_CLASSES[tone]}`}>
        {icon}
      </div>
      <div>
        <div className="text-sm text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: dash, isLoading, isError } = useQuery({
    queryKey: qk.dashboard,
    queryFn: getDashboard,
    refetchInterval: 60_000, // jaring pengaman bila WS putus
  });

  const { data: orders } = useQuery({
    queryKey: qk.orders(undefined, 1, 8),
    queryFn: () => getOrdersOverview({ page: 1, limit: 8 }),
  });

  if (isLoading) return <TableSkeleton rows={6} cols={3} />;
  if (isError || !dash) {
    return <div className="card p-6 text-rose-600">Gagal memuat dashboard.</div>;
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Ringkasan operasional hari ini — diperbarui real-time via WebSocket."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Order hari ini" value={dash.todayOrders} icon="🧾" tone="pijar" />
        <StatCard label="Order aktif" value={dash.activeOrders} icon="⚡" tone="sky" />
        <StatCard label="GMV hari ini" value={formatIdr(dash.todayGmv)} icon="💰" tone="emerald" />
        <StatCard
          label="Verifikasi pending"
          value={dash.pendingVerifications}
          icon="📋"
          tone="amber"
        />
        <StatCard label="Dispute terbuka" value={dash.openDisputes} icon="⚖️" tone="rose" />
        <StatCard label="Mitra online" value={dash.onlineMitra} icon="🧑‍🔧" tone="violet" />
      </div>

      <div className="card mt-6">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Order terbaru
        </div>
        <div className="divide-y divide-slate-100">
          {(orders?.data ?? []).map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-800">{o.serviceName}</div>
                <div className="truncate text-xs text-slate-500">
                  {o.customer.name} · {o.mitraName ?? 'belum ada mitra'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-slate-700">{formatIdr(o.finalPrice ?? o.customerPrice)}</span>
                <StatusBadge status={o.status} />
              </div>
            </div>
          ))}
          {orders && orders.data.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">Belum ada order.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
