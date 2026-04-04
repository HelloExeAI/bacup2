import { find } from "geo-tz";

/** IANA timezone for coordinates, or UTC fallback (never throws). */
export function timezoneAt(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "UTC";
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return "UTC";
  try {
    const zones = find(lat, lon);
    return zones[0] ?? "UTC";
  } catch (e) {
    console.warn("[geo-tz] lookup failed", e);
    return "UTC";
  }
}
