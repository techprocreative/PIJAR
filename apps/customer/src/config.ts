import Constants from 'expo-constants';

/**
 * Base URL API.
 * - Prioritas: env EXPO_PUBLIC_API_URL (build / `EXPO_PUBLIC_API_URL=... npx expo start`)
 * - Dev Expo Go: host laptop (debuggerHost) supaya emulator/device bisa menjangkau server lokal
 * - Fallback: localhost (untuk web / emulator iOS)
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost') return `http://${host}:3001`;
  }
  return 'http://localhost:3001';
}

export const API_URL = resolveApiUrl();
export const WS_URL = `${API_URL}/ws`;
