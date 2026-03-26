import { NextResponse } from "next/server";
import { z } from "zod";

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

  const system =
    "You are SAM, a highly intelligent executive assistant helping a founder prioritize work.\n\nYour job is to:\n- Identify what matters most\n- Suggest what to do next\n- Highlight risks (missed tasks, overload)\n- Be concise, clear, and action-oriented\n\nReturn ONLY a JSON array of 3-5 short bullet suggestions (strings). No extra text.";

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

  const text: string =
    body?.choices?.[0]?.message?.content ??
    body?.choices?.[0]?.message?.text ??
    "";

  const suggestions = coerceSuggestions(text).slice(0, 5);
  cache.set(key, { at: now, suggestions });
  return NextResponse.json({ suggestions, cached: false });
}

