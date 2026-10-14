import * as Location from 'expo-location';
import { GeoPoint } from '@pijar/shared';

export interface ResolvedAddress {
  location: GeoPoint;
  label: string;
  detail: string;
}

/** Minta izin lokasi; return false bila ditolak (UI harus fallback ke input manual). */
export async function ensureLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/** Ambil posisi sekarang; null bila izin ditolak / lokasi gagal. */
export async function getCurrentLocation(): Promise<GeoPoint | null> {
  const granted = await ensureLocationPermission();
  if (!granted) return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
  if (!pos) return null;
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/** Reverse geocode OSM Nominatim (biaya nol — lihat ARCHITECTURE.md pilihan maps). */
export async function reverseGeocode(point: GeoPoint): Promise<ResolvedAddress> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}&accept-language=id`,
      { headers: { 'User-Agent': 'pijar-customer/0.1' } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload: unknown = await res.json();
    let label = 'Lokasi saat ini';
    let detail = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
    if (payload !== null && typeof payload === 'object') {
      const addr = 'address' in payload ? payload.address : null;
      if (addr !== null && typeof addr === 'object') {
        const a = addr as Record<string, unknown>;
        const road = typeof a.road === 'string' ? a.road : '';
        const village = typeof a.village === 'string' ? a.village : '';
        const city = typeof a.city === 'string' ? a.city : typeof a.town === 'string' ? a.town : '';
        const parts = [road, village, city].filter((p) => p.length > 0);
        if (parts.length > 0) detail = parts.join(', ');
      }
      if ('name' in payload && typeof payload.name === 'string' && payload.name) label = payload.name;
    }
    return { location: point, label, detail };
  } catch {
    return { location: point, label: 'Lokasi saat ini', detail: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` };
  }
}

/** Forward geocode — cari alamat teks → titik + label. */
export async function searchAddress(query: string): Promise<ResolvedAddress[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=id&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'pijar-customer/0.1' } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list: unknown = await res.json();
    if (!Array.isArray(list)) return [];
    const results: ResolvedAddress[] = [];
    for (const item of list) {
      if (item !== null && typeof item === 'object' && 'lat' in item && 'lon' in item && 'display_name' in item) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          results.push({
            location: { lat, lng },
            label: String(item.display_name).split(',')[0],
            detail: String(item.display_name),
          });
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}
