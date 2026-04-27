import { NextResponse } from "next/server";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  noteId: z.string().uuid(),
});

function safeLines(x: unknown, max = 10): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .slice(0, max);
}

function safeParseJsonObject(raw: string): any | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function GET(req: Request) {
  const supabase = supabaseFromBearer(req);
  if (!supabase) return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({ noteId: searchParams.get("noteId") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid noteId" }, { status: 400 });
  }

  const { data: note, error: noteErr } = await supabase
    .from("notes")
    .select("id,content,type,parent_id,created_at")
    .eq("id", parsed.data.noteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (noteErr) return NextResponse.json({ error: noteErr.message }, { status: 500 });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only summarize transcripts.
  if (String((note as any).type) !== "meeting_transcript") {
    return NextResponse.json({ error: "Expected a meeting_transcript note" }, { status: 400 });
  }

  const parentId = String((note as any).parent_id ?? "").trim();
  if (parentId) {
    const { data: cached } = await supabase
      .from("notes")
      .select("id,content,type,parent_id,created_at")
      .eq("user_id", user.id)
      .eq("parent_id", parentId)
      .eq("type", "meeting_ai_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cachedRaw = String((cached as any)?.content ?? "").trim();
    const cachedJson = safeParseJsonObject(cachedRaw);
    if (cachedJson) {
      const summary = typeof cachedJson?.summary === "string" ? cachedJson.summary.trim() : "";
      const decisions = safeLines(cachedJson?.decisions, 8);
      const actionItems = safeLines(cachedJson?.actionItems, 10);
      return NextResponse.json({
        summary,
        decisions,
        actionItems,
        source: "cached",
      });
    }
  }

  const transcript = String((note as any).content ?? "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "Empty transcript" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  if (!apiKey) {
    return NextResponse.json({
      summary: "",
      decisions: [],
      actionItems: [],
      source: "no_openai_key",
    });
  }

  const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 1400);
  if (!quota.ok) {
    return NextResponse.json({
      summary: "",
      decisions: [],
      actionItems: [],
      source: "quota_exceeded",
    });
  }

  const system = [
    "You summarize meeting transcripts for a productivity app.",
    "Return STRICT JSON only with keys: summary, decisions, actionItems.",
    "summary: 1-2 sentences, crisp.",
    "decisions: array of strings (0-8). Only explicit decisions/agreements.",
    "actionItems: array of strings (0-10). Only explicit tasks, include owner if said.",
    "No markdown, no bullets, no extra keys.",
  ].join("\n");

  const userMsg = `Transcript:\n${transcript.slice(0, 40_000)}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      max_tokens: 500,
    }),
  });

  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    return NextResponse.json({
      summary: "",
      decisions: [],
      actionItems: [],
      source: "openai_error",
    });
  }

  const usage = extractOpenAIUsageFromChatCompletion(body);
  if (usage && usage.totalTokens > 0) {
    await recordOpenAITokenUsage(supabase, user.id, usage.totalTokens);
  }

  const text: string = body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.message?.text ?? "";
  const raw = String(text ?? "").trim();
  const j: any = safeParseJsonObject(raw);

  const summary = typeof j?.summary === "string" ? j.summary.trim() : "";
  const decisions = safeLines(j?.decisions, 8);
  const actionItems = safeLines(j?.actionItems, 10);

  // Best-effort cache on the parent meeting note for future views.
  if (parentId && raw) {
    await supabase.from("notes").insert({
      user_id: user.id,
      content: raw,
      type: "meeting_ai_summary",
      parent_id: parentId,
      parsed: true,
    });
  }

  return NextResponse.json({
    summary,
    decisions,
    actionItems,
    source: "openai",
  });
}

