import { NextResponse } from "next/server";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  htmlBody: z.string().max(200_000),
  instructions: z.string().trim().min(1).max(4000),
  /** When "new", response includes subject + body JSON; reply/forward use body only. */
  composeMode: z.enum(["new", "reply"]).optional(),
  /** Current subject line (new compose) — helps the model refine both fields. */
  currentSubject: z.string().max(500).optional(),
});

function toneBlock(tone: string) {
  if (tone === "direct") {
    return "Default voice for this user: direct and efficient. Short sentences. No filler.";
  }
  if (tone === "detailed") {
    return "Default voice for this user: thorough and professional. Clear structure, enough context.";
  }
  return "Default voice for this user: balanced professional — clear, courteous, concise.";
}

function parseJsonObjectFromModel(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  try {
    const j = JSON.parse(trimmed);
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      const j = JSON.parse(fenced[1]);
      return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const j = JSON.parse(trimmed.slice(first, last + 1));
      return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
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

  const { htmlBody, instructions, composeMode, currentSubject } = parsed.data;
  const plainProbe = htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!plainProbe.length) {
    return NextResponse.json({ error: "Email body is empty." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 8000);
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

  const isNewCompose = composeMode === "new";

  const system = isNewCompose
    ? [
        "You improve a new outbound email: both the subject line and the HTML body.",
        toneBlock(safeTone),
        "Apply the user's explicit instructions (tone, length, formality).",
        "Return JSON ONLY with exactly two keys: \"subject\" (string) and \"bodyHtml\" (string).",
        "subject: one line, suitable for an email Subject field. No newlines.",
        "bodyHtml: valid HTML fragment only — use <p>, <br>, <strong>, <em>, <ul>, <ol>, <li>. No <!DOCTYPE>, <html>, <head>, or <body>.",
        "CRITICAL: bodyHtml must NOT repeat the subject line, echo it as the first paragraph, or open with the same wording as the subject. Start the body with greeting or context, not the subject.",
        "Do not invent facts, names, numbers, dates, or commitments. Preserve meaning from the draft.",
      ].join("\n")
    : [
        "You rewrite email body content for professional outbound email.",
        toneBlock(safeTone),
        "Apply the user's explicit instructions below (tone, length, formality) on top of that default voice.",
        "Output valid HTML only: use <p>, <br>, <strong>, <em>, <ul>, <ol>, <li> as needed. No markdown code fences. No <!DOCTYPE>, <html>, <head>, or <body> tags.",
        "Do not invent facts, names, numbers, dates, or commitments. Preserve the meaning and any specifics from the draft.",
        "Return ONLY the HTML fragment for the message body, with no preamble or explanation.",
      ].join("\n");

  const userMsg = isNewCompose
    ? [
        `How to redraft: ${instructions}`,
        "",
        `Current subject (may be empty): ${currentSubject ?? ""}`,
        "",
        "Current draft (HTML body):",
        htmlBody.slice(0, 120_000),
      ].join("\n")
    : [
        `How to redraft: ${instructions}`,
        "",
        "Current draft (HTML):",
        htmlBody.slice(0, 120_000),
      ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      max_tokens: isNewCompose ? 2800 : 2500,
    }),
  });

  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    const openaiCode = body?.error?.code;
    const openaiMessage = body?.error?.message;
    if (openaiCode === "invalid_api_key") {
      return NextResponse.json(
        { error: "Invalid OPENAI_API_KEY. Update key in .env.local and restart server.", code: "invalid_openai_api_key" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: typeof openaiMessage === "string" ? openaiMessage : "OpenAI request failed" },
      { status: 500 },
    );
  }

  const u = extractOpenAIUsageFromChatCompletion(body);
  if (u && u.totalTokens > 0) {
    await recordOpenAITokenUsage(supabase, user.id, u.totalTokens);
  }

  const raw: string =
    body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.message?.text ?? "";

  const trimmed = raw.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Empty model response" }, { status: 502 });
  }

  if (isNewCompose) {
    const obj = parseJsonObjectFromModel(trimmed);
    const subj = typeof obj?.subject === "string" ? obj.subject.trim().replace(/\s+/g, " ") : "";
    let bodyHtml = typeof obj?.bodyHtml === "string" ? obj.bodyHtml.trim() : "";
    if (!subj || !bodyHtml) {
      return NextResponse.json({ error: "Invalid subject+body JSON from model" }, { status: 502 });
    }
    const fence = /^```(?:html)?\s*([\s\S]*?)```$/m.exec(bodyHtml);
    if (fence?.[1]) bodyHtml = fence[1].trim();
    return NextResponse.json({ subject: subj, html: bodyHtml, composeMode: "new" as const });
  }

  let htmlOut = trimmed;
  const fence = /^```(?:html)?\s*([\s\S]*?)```$/m.exec(trimmed);
  if (fence?.[1]) htmlOut = fence[1].trim();

  return NextResponse.json({ html: htmlOut, composeMode: "reply" as const });
}
