// Layout shell admin: sidebar navigasi + topbar + <Outlet/>.
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider';
import { useAdminRealtime } from '../realtime/useAdminRealtime';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/verifikasi', label: 'Verifikasi Mitra' },
  { to: '/dispute', label: 'Dispute' },
  { to: '/orders', label: 'Orders' },
  { to: '/voucher', label: 'Voucher' },
  { to: '/banner', label: 'Promo Banner' },
  { to: '/wallet', label: 'Wallet Adjust' },
];

export default function Layout() {
  const { user, logout } = useSession();
  const location = useLocation();

  useAdminRealtime();

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <span className="text-2xl">🔥</span>
          <div>
            <div className="text-lg font-bold text-slate-900">PIJAR</div>
            <div className="text-xs uppercase tracking-wide text-pijar-600">Admin Panel</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-pijar-50 text-pijar-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="mb-2 text-sm font-medium text-slate-800">{user?.name}</div>
          <div className="mb-3 text-xs text-slate-500">{user?.phone}</div>
          <button onClick={logout} className="btn-secondary w-full">
            Keluar
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar mobile */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔥</span>
            <span className="font-bold text-slate-900">PIJAR Admin</span>
          </div>
          <button onClick={logout} className="text-sm font-medium text-rose-600">
            Keluar
          </button>
        </header>

        {/* Navigasi mobile sederhana */}
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2 md:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  isActive ? 'bg-pijar-50 text-pijar-700' : 'text-slate-600'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main key={location.pathname} className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
