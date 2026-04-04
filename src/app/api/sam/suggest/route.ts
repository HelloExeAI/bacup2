import { NextResponse } from "next/server";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SamInputSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      due_date: z.string().nullable().optional(),
      due_time: z.string().nullable().optional(),
      type: z.string().optional(),
      assigned_to: z.string().optional(),
      status: z.string().optional(),
    }),
  ),
  events: z.array(
    z.object({
      title: z.string().nullable().optional(),
      date: z.string().nullable().optional(),
      time: z.string().nullable().optional(),
    }),
  ),
  today_focus: z.array(
    z.object({
      title: z.string(),
      due_date: z.string().nullable().optional(),
      due_time: z.string().nullable().optional(),
      type: z.string().optional(),
      assigned_to: z.string().optional(),
      status: z.string().optional(),
    }),
  ),
});

type CacheEntry = { at: number; suggestions: string[] };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function stableKey(userId: string, input: unknown) {
  // Fast-ish stable key for small payloads.
  const s = JSON.stringify(input);
  return `${userId}:${s.length}:${s}`;
}

function coerceSuggestions(text: string): string[] {
  const trimmed = text.trim();
  // Attempt JSON array parse first.
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}

  // Fallback: split lines/bullets.
  return trimmed
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = SamInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const input = parsed.data;
  const key = stableKey(user.id, input);
  const existing = cache.get(key);
  const now = Date.now();
  if (existing && now - existing.at < TTL_MS) {
    return NextResponse.json({ suggestions: existing.suggestions, cached: true });
  }

  const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 600);
  if (!quota.ok) {
    return NextResponse.json(
      { error: "AI quota exceeded for this month.", code: "quota_exceeded", kind: "openai" },
      { status: 402 },
    );
  }

  const system =
    "You are SAM, an elite executive assistant for high-performing professionals.\n\nYour job is to:\n- Identify the most important action right now\n- Prevent missed commitments\n- Reduce overwhelm\n- Push the user toward high-impact work\n\nRules:\n- Be direct and decisive\n- No generic advice\n- Prioritize impact over urgency when needed\n- Max 4 suggestions\n- Each suggestion must be actionable\n\nTone:\n- Clear\n- Confident\n- Slightly authoritative\n\nReturn ONLY a JSON array of 1-4 short actionable suggestions (strings). No extra text.";

  const userMsg = `Context (JSON):\n${JSON.stringify(input)}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      max_tokens: 180,
    }),
  });

  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    return NextResponse.json(
      { error: body?.error?.message || "OpenAI request failed" },
      { status: 500 },
    );
  }

  const u = extractOpenAIUsageFromChatCompletion(body);
  if (u && u.totalTokens > 0) {
    await recordOpenAITokenUsage(supabase, user.id, u.totalTokens);
  }

  const text: string =
    body?.choices?.[0]?.message?.content ??
    body?.choices?.[0]?.message?.text ??
    "";

  const suggestions = coerceSuggestions(text).slice(0, 4);
  cache.set(key, { at: now, suggestions });
  return NextResponse.json({ suggestions, cached: false });
}

