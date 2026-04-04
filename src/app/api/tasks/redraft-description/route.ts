import { NextResponse } from "next/server";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  due_date: z.string().optional(),
  due_time: z.string().optional(),
  assigned_to: z.string().optional(),
  type: z.enum(["todo", "followup", "reminder"]).optional(),
  /** redraft = polish user text; summarize = create description from title + context when details are light or empty */
  intent: z.enum(["redraft", "summarize"]).default("redraft"),
});

function toneBlock(tone: string) {
  if (tone === "direct") {
    return "Tone: Direct and efficient. Short sentences. No filler words. Prefer clarity over warmth.";
  }
  if (tone === "detailed") {
    return "Tone: Thorough and professional. Complete sentences, light structure, enough context for someone else to execute.";
  }
  return "Tone: Balanced professional — clear, courteous, concise without being terse.";
}

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 900);
  if (!quota.ok) {
    return NextResponse.json(
      { error: "AI quota exceeded for this month.", code: "quota_exceeded", kind: "openai" },
      { status: 402 },
    );
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("assistant_tone")
    .eq("user_id", user.id)
    .maybeSingle();

  const tone = String(settings?.assistant_tone ?? "balanced");
  const safeTone = tone === "direct" || tone === "detailed" ? tone : "balanced";

  const { title, description, due_date, due_time, assigned_to, type, intent } = parsed.data;
  const desc = (description ?? "").trim();

  const system = [
    "You rewrite task descriptions for a productivity app used by executives and operators.",
    "Output must be professional, clean, and easy to scan. No markdown headings. No emojis.",
    "Do not add fictional facts. Only use what the user provided.",
    toneBlock(safeTone),
    intent === "redraft"
      ? "Rewrite the user's draft in place: preserve intent, improve clarity and grammar."
      : "Write a short professional description that captures the task. If only the title exists, expand minimally with reasonable professional framing (still no invented commitments).",
    "Return ONLY the description text, no quotes, no preamble.",
  ].join("\n");

  const ctx = [
    `Task title: ${title}`,
    due_date ? `Due date: ${due_date}` : null,
    due_time ? `Due time: ${due_time}` : null,
    assigned_to ? `Assigned to: ${assigned_to}` : null,
    type ? `Type: ${type}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userMsg =
    intent === "redraft" && desc.length > 0
      ? `${ctx}\n\nCurrent description to redraft:\n${desc}`
      : `${ctx}\n\nThe user has not written a description (or it is empty). Write a concise professional description based on the title and context above.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      max_tokens: 400,
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
    body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.message?.text ?? "";

  const redrafted = text.trim();
  if (!redrafted) {
    return NextResponse.json({ error: "Empty model response" }, { status: 502 });
  }

  return NextResponse.json({ text: redrafted });
}
