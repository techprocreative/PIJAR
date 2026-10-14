// Query keys TanStack Query — konsisten agar invalidation lintas halaman bekerja.

export const qk = {
  dashboard: ['admin', 'dashboard'] as const,
  verifications: (page: number, limit: number) => ['admin', 'verifications', page, limit] as const,
  disputes: (status: string | undefined, page: number, limit: number) =>
    ['admin', 'disputes', status ?? 'all', page, limit] as const,
  vouchers: (page: number, limit: number) => ['admin', 'vouchers', page, limit] as const,
  banners: (page: number, limit: number) => ['admin', 'banners', page, limit] as const,
  orders: (status: string | undefined, page: number, limit: number) =>
    ['admin', 'orders', status ?? 'all', page, limit] as const,
};
