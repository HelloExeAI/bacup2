import { NextResponse } from "next/server";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const InputSchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  today_tasks: z.array(
    z.object({
      title: z.string(),
      type: z.string().optional(),
      due_date: z.string().nullable().optional(),
      due_time: z.string().nullable().optional(),
      status: z.string().optional(),
    }),
  ),
  today_events: z.array(
    z.object({
      title: z.string().nullable().optional(),
      date: z.string().nullable().optional(),
      time: z.string().nullable().optional(),
    }),
  ),
  backlog: z.array(
    z.object({
      title: z.string(),
      type: z.string().optional(),
      due_date: z.string().nullable().optional(),
      due_time: z.string().nullable().optional(),
      status: z.string().optional(),
    }),
  ),
});

function parseBullets(text: string) {
  const out = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => {
      const compact = line.replace(/\s+/g, " ").trim();
      if (compact.length <= 78) return compact;
      return `${compact.slice(0, 77).trimEnd()}...`;
    });
  return out.slice(0, 3);
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 800);
  if (!quota.ok) {
    return NextResponse.json(
      { error: "AI quota exceeded for this month.", code: "quota_exceeded", kind: "openai" },
      { status: 402 },
    );
  }

  const system = `You are Bacup Daily Briefing Engine.
Create a quick day plan briefing for today.
Rules:
- Return exactly 3 bullet points.
- Each bullet must be very short, crisp, and complete.
- Keep each bullet <= 12 words.
- Mention workload, key commitments, and first best action.
- No fluff, no emojis, no markdown headings.
- Output plain text with one bullet per line starting with "- ".`;

  const userMsg = `Today context (JSON):\n${JSON.stringify(parsed.data)}`;

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
      max_tokens: 120,
    }),
  });

  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    return NextResponse.json(
      { error: body?.error?.message || "OpenAI request failed" },
      { status: 502 },
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
  const bullets = parseBullets(text);
  return NextResponse.json({ bullets });
}

