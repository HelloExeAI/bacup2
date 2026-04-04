import { NextResponse } from "next/server";
import { z } from "zod";

import { nominatimSearch } from "@/lib/geo/nominatim";
import { photonSearch } from "@/lib/geo/photon";
import { timezoneAt } from "@/lib/geo/timezoneAt";

const QuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ q: url.searchParams.get("q") ?? "" });
    if (!parsed.success) {
      return NextResponse.json({ error: "Query too short", results: [] }, { status: 400 });
    }

    let results: Array<{ displayName: string; lat: number; lon: number; timezone: string }> = [];
    try {
      const hits = await nominatimSearch(parsed.data.q);
      results = hits.map((h) => {
        const lat = Number(h.lat);
        const lon = Number(h.lon);
        return {
          displayName: h.display_name,
          lat,
          lon,
          timezone: timezoneAt(lat, lon),
        };
      });
    } catch (e) {
      console.warn("[geo/search] Nominatim failed, using Photon", e);
    }
    if (results.length === 0) {
      const hits = await photonSearch(parsed.data.q);
      results = hits.map((h) => ({
        displayName: h.displayName,
        lat: h.lat,
        lon: h.lon,
        timezone: timezoneAt(h.lat, h.lon),
      }));
    }

    return NextResponse.json({ results });
  } catch (e) {
    console.error("[geo/search]", e);
    return NextResponse.json({ error: "Search failed", results: [] }, { status: 500 });
  }
}
