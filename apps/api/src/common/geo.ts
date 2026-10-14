import { GeoPoint } from '@pijar/shared';

const EARTH_RADIUS_KM = 6371;

/** Jarak great-circle antara dua titik (km) — dipakai untuk jarak mitra↔order. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function isValidLat(lat: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLng(lng: unknown): lng is number {
  return typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}
