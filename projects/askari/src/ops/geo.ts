/**
 * Where a guard was, compared with where the site is. Pure and conservative: it only ever FLAGS, it never blocks a check-in, because a
 * phone's GPS indoors or in a cutting is often wrong and a guard who cannot check in is worse than a flag a supervisor reads.
 */
export type Geofence = 'within' | 'outside' | 'unknown';

export interface Fix {
  lat: number;
  lng: number;
  /** the phone's own estimate of its error in metres, when it gave one */
  accuracyM?: number | null;
}

export interface SiteFence {
  lat: number | null;
  lng: number | null;
  radiusM: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function validFix(fix: { lat: unknown; lng: unknown } | null | undefined): fix is Fix {
  return !!fix && typeof fix.lat === 'number' && typeof fix.lng === 'number' && Number.isFinite(fix.lat) && Number.isFinite(fix.lng) && Math.abs(fix.lat) <= 90 && Math.abs(fix.lng) <= 180;
}

/** Great-circle distance in whole metres. */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/**
 * within: the fix is inside the radius. outside: it is outside even after giving the phone the benefit of its own stated error.
 * unknown: no site coordinates, no usable fix, or too close to the edge to say. (0,0) is treated as "no fix": it is what many devices
 * report when they have none.
 */
export function geofenceResult(site: SiteFence, fix: Fix | null | undefined): { geofence: Geofence; distanceM: number | null } {
  if (site.lat === null || site.lng === null || !validFix(fix) || (fix.lat === 0 && fix.lng === 0)) return { geofence: 'unknown', distanceM: null };
  const distance = haversineMeters(site.lat, site.lng, fix.lat, fix.lng);
  if (distance <= site.radiusM) return { geofence: 'within', distanceM: distance };
  const accuracy = Math.max(0, fix.accuracyM ?? 0);
  if (distance - accuracy > site.radiusM) return { geofence: 'outside', distanceM: distance };
  return { geofence: 'unknown', distanceM: distance };
}
