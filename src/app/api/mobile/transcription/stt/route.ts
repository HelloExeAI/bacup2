import { NextResponse } from "next/server";

import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";
import { transcribeWithDeepgramFirstFallbackOpenAI } from "@/lib/transcription/stt";

export const dynamic = "force-dynamic";

/**
 * Mobile-only STT endpoint.
 * - Auth: `Authorization: Bearer <supabase access_token>`
 * - Body: multipart/form-data with `file` (audio)
 * - Uses user settings language code (preferred_language) with Deepgram-first, OpenAI fallback.
 */
export async function POST(req: Request) {
  try {
    const auth = supabaseFromBearer(req);
    if (!auth) return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });

    const {
      data: { user },
      error: userErr,
    } = await auth.auth.getUser();
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const mimeType = file.type || "application/octet-stream";
    const audio = await file.arrayBuffer();

    const { data: settingsRow } = await auth
      .from("user_settings")
      .select("preferred_language")
      .eq("user_id", user.id)
      .maybeSingle();
    const languageCode = (settingsRow as any)?.preferred_language ?? "en";

    const out = await transcribeWithDeepgramFirstFallbackOpenAI({ audio, mimeType, languageCode });
    return NextResponse.json({ transcript: out.transcript, provider: out.provider });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg || "Transcription failed" }, { status: 500 });
  }
}

