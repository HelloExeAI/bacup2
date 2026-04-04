import { NextResponse } from "next/server";
import { z } from "zod";

import { recordDeepgramSeconds } from "@/lib/billing/aiQuota";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  /** Wall-clock seconds the user had the mic session open (capped server-side). */
  seconds: z.number().int().min(0).max(6 * 3600),
});

/**
 * Client-reported live transcription duration for quota metering (scratchpad mic, Ask Bacup mic).
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const sec = parsed.data.seconds;
  if (sec === 0) {
    return NextResponse.json({ ok: true, recorded: 0 });
  }

  const result = await recordDeepgramSeconds(supabase, user.id, sec);
  if (!result.ok && result.error === "insufficient_voice_quota") {
    return NextResponse.json(
      { error: "Voice quota exceeded.", code: "quota_exceeded", kind: "deepgram" },
      { status: 402 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Usage update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recorded: sec });
}
