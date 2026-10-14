// Helper env — semua secrets wajib dari environment (lihat .env.example)

export function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET wajib di-set di production');
  }
  return s ?? 'pijar-dev-secret-ganti-di-production';
}

export function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_MODE === 'true';
}
