// Root aplikasi: routing + guard sesi admin.
// Halaman dipisah per fitur (lazy supaya bundle awal ramping).

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './auth/SessionProvider';
import Layout from './components/Layout';
import FullPageLoader from './components/FullPageLoader';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const VerificationsPage = lazy(() => import('./pages/VerificationsPage'));
const DisputesPage = lazy(() => import('./pages/DisputesPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const VouchersPage = lazy(() => import('./pages/VouchersPage'));
const BannersPage = lazy(() => import('./pages/BannersPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));

/** Halaman wajib login admin; belum login → /login. */
function RequireAdmin({ children }: { children: React.ReactElement }) {
  const { user } = useSession();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <SessionProvider>
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAdmin>
                <Layout />
              </RequireAdmin>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="verifikasi" element={<VerificationsPage />} />
            <Route path="dispute" element={<DisputesPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="voucher" element={<VouchersPage />} />
            <Route path="banner" element={<BannersPage />} />
            <Route path="wallet" element={<WalletPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </SessionProvider>
  );
}
