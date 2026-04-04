/** Komoot Photon (OSM) — fallback geocoder when Nominatim is unavailable. */

const USER_AGENT = "Bacup/1.0 (https://github.com/)";

type PhotonFeature = {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};

export type PhotonSearchHit = {
  displayName: string;
  lat: number;
  lon: number;
};

export async function photonSearch(q: string): Promise<PhotonSearchHit[]> {
  const url = new URL("https://photon.komoot.io/api");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "en");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: PhotonFeature["properties"];
    }>;
  };
  const out: PhotonSearchHit[] = [];
  for (const f of data.features ?? []) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lon, lat] = coords;
    const p = f.properties;
    if (!p) continue;
    const parts = [
      [p.housenumber, p.street].filter(Boolean).join(" ").trim() || p.name,
      p.city,
      p.state,
      p.country,
    ].filter(Boolean);
    const displayName = parts.join(", ").trim();
    if (!displayName) continue;
    out.push({ displayName, lat, lon });
  }
  return out;
}

export async function photonReverse(lat: number, lon: number): Promise<string | null> {
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("lang", "en");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const p = data.features?.[0]?.properties;
  if (!p) return null;
  const parts = [
    [p.housenumber, p.street].filter(Boolean).join(" ").trim() || p.name,
    p.city,
    p.state,
    p.country,
  ].filter(Boolean);
  const s = parts.join(", ").trim();
  return s || null;
}
