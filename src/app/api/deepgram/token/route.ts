import { NextResponse } from "next/server";

import { assertDeepgramQuotaAvailable } from "@/lib/billing/aiQuota";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  // Ensure only authenticated app users can mint Deepgram tokens.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const voice = await assertDeepgramQuotaAvailable(supabase, user.id, 15);
  if (!voice.ok) {
    return NextResponse.json(
      {
        error: "Voice transcription quota exceeded for this month. Add voice minutes in Plans or upgrade.",
        code: "quota_exceeded",
        kind: "deepgram",
      },
      { status: 402 },
    );
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing DEEPGRAM_API_KEY on server." },
      { status: 500 },
    );
  }

  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { error: json?.err_msg || json?.error || "Deepgram token grant failed" },
      { status: res.status },
    );
  }

  return NextResponse.json({
    access_token: json?.access_token,
    expires_in: json?.expires_in,
  });
}

