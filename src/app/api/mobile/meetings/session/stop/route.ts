import { NextResponse } from "next/server";

import {
  MeetingSessionStopBodySchema,
  processMeetingSessionStop,
} from "@/lib/meetings/processMeetingSessionStop";
import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";

export const dynamic = "force-dynamic";

/**
 * Same body and behavior as POST /api/meetings/session/stop, but authenticates with
 * `Authorization: Bearer <Supabase access_token>` so the Expo app can call it without cookies.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = MeetingSessionStopBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = supabaseFromBearer(req);
  if (!supabase) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await processMeetingSessionStop(supabase, user, parsed.data);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
