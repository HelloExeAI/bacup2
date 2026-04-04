/** OpenStreetMap Nominatim — respect https://operations.osmfoundation.org/policies/nominatim/ (valid User-Agent, cache). */

const USER_AGENT = "Bacup/1.0 (settings location; contact: support@example.com)";

export type NominatimSearchHit = {
  display_name: string;
  lat: string;
  lon: string;
};

export async function nominatimSearch(q: string): Promise<NominatimSearchHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "8");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Nominatim search failed (${res.status})`);
  const data = (await res.json()) as NominatimSearchHit[];
  return Array.isArray(data) ? data : [];
}

export async function nominatimReverse(lat: number, lon: number): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Nominatim reverse failed (${res.status})`);
  const data = (await res.json()) as { display_name?: string };
  return data.display_name ?? null;
}
