import { NextResponse } from "next/server";
import { z } from "zod";

import { nominatimReverse } from "@/lib/geo/nominatim";
import { photonReverse } from "@/lib/geo/photon";
import { timezoneAt } from "@/lib/geo/timezoneAt";

const BodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

async function resolveDisplayName(lat: number, lon: number): Promise<string> {
  const fallback = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  try {
    const n = await nominatimReverse(lat, lon);
    if (n) return n;
  } catch (e) {
    console.warn("[geo/from-coords] Nominatim reverse failed", e);
  }
  try {
    const p = await photonReverse(lat, lon);
    if (p) return p;
  } catch (e) {
    console.warn("[geo/from-coords] Photon reverse failed", e);
  }
  return fallback;
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }

    const { lat, lon } = parsed.data;
    const displayName = await resolveDisplayName(lat, lon);
    const timezone = timezoneAt(lat, lon);

    return NextResponse.json({
      displayName,
      timezone,
      lat,
      lon,
    });
  } catch (e) {
    console.error("[geo/from-coords]", e);
    return NextResponse.json({ error: "Could not resolve location" }, { status: 500 });
  }
}
