import { NextResponse } from "next/server";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  due_date: z.string().optional(),
  due_time: z.string().optional(),
  assigned_to: z.string().optional(),
  type: z.enum(["todo", "followup", "reminder"]).optional(),
});

const ModelOutSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  assigned_to: z.string().trim().min(1).max(120),
});

/**
 * Mobile-only AI task redraft.
 * Auth: `Authorization: Bearer <Supabase access_token>` (same pattern as mobile meeting routes).
 *
 * Returns: `{ title, description, assigned_to }`
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 1200);
  if (!quota.ok) {
    return NextResponse.json(
      { error: "AI quota exceeded for this month.", code: "quota_exceeded", kind: "openai" },
      { status: 402 },
    );
  }

  const { title, description, due_date, due_time, assigned_to, type } = parsed.data;
  const desc = String(description ?? "").trim();
  const assigned = String(assigned_to ?? "").trim();

  const system = [
    "You rewrite tasks for a productivity app.",
    "Return STRICT JSON only, no markdown, no extra keys.",
    "Do not invent facts, names, dates, or commitments not present in the input.",
    "If the assignee is not explicitly provided, set assigned_to to 'self'.",
    "The description must contain zero-tolerance execution instructions: concrete steps, acceptance criteria, and a short checklist. No fluff.",
    "Keep it professional and unambiguous.",
    "JSON shape:",
    `{"title":"...","description":"...","assigned_to":"..."}`,
  ].join("\n");

  const ctx = [
    `Current title: ${title}`,
    desc ? `Current description: ${desc}` : "Current description: (empty)",
    due_date ? `Due date: ${due_date}` : null,
    due_time ? `Due time: ${due_time}` : null,
    assigned ? `Assigned to: ${assigned}` : "Assigned to: (missing)",
    type ? `Type: ${type}` : null,
  ]
    .filter(Boolean)
    .join("\n");

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
        { role: "user", content: ctx },
      ],
      max_tokens: 700,
    }),
  });

  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    return NextResponse.json({ error: body?.error?.message || "OpenAI request failed" }, { status: 500 });
  }

  const u = extractOpenAIUsageFromChatCompletion(body);
  if (u && u.totalTokens > 0) {
    await recordOpenAITokenUsage(supabase, user.id, u.totalTokens);
  }

  const text: string = body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.message?.text ?? "";
  const raw = String(text).trim();
  if (!raw) return NextResponse.json({ error: "Empty model response" }, { status: 502 });

  const parsedJson = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      // Some models wrap JSON in prose; try to extract the first {...} block.
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(raw.slice(start, end + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  })();

  const out = ModelOutSchema.safeParse(parsedJson);
  if (!out.success) {
    return NextResponse.json({ error: "Invalid model output" }, { status: 502 });
  }

  return NextResponse.json(out.data);
}

