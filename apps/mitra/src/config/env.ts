/**
 * Konfigurasi lingkungan app mitra PIJAR.
 * - API_URL: base URL backend NestJS (default: LAN dev di port 3001 sesuai apps/api/.env)
 * - WS_PATH: namespace Socket.IO realtime (`/ws`)
 */
import Constants from 'expo-constants';

const devHost = Constants.expoConfig?.hostUri?.split(':')?.[0] ?? 'localhost';

// Expo inlines EXPO_PUBLIC_* at build time; fallback via app.json extra.apiUrl.
const manifestApiUrl = Constants.expoConfig?.extra
  ? (Constants.expoConfig.extra as { apiUrl?: string }).apiUrl
  : undefined;

export const API_URL = manifestApiUrl ?? `http://${devHost}:3001`;
export const WS_URL = `${API_URL}/ws`;

// Interval kirim lokasi mitra saat online (ms) — kontrak: 5–10 detik
export const LOCATION_SEND_INTERVAL_MS = 7_000;

export const ASYNC_STORAGE_KEYS = {
  auth: '@pijar/mitra/auth',
} as const;
