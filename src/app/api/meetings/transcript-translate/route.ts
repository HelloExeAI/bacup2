import { NextResponse } from "next/server";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    /** Full or partial transcript; chunked server-side for long meetings. */
    text: z.string().min(1).max(200_000),
  })
  .strict();

const CHUNK_SOFT = 7000;

function chunkTranscript(text: string): string[] {
  const t = text.trim();
  if (t.length <= CHUNK_SOFT) return [t];
  const lines = t.split("\n");
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length > CHUNK_SOFT && cur) {
      chunks.push(cur);
      cur = line;
    } else {
      cur = next;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

const SYSTEM = [
  "You translate meeting transcripts into clear English.",
  'Lines may look like "Person 1: …" or "Person 2: …". Keep the exact "Person N:" prefix on each line; translate only the text after the colon.',
  "Preserve line breaks between lines. Do not merge different Person lines into one.",
  "If the input is already English, return it with light grammar cleanup only.",
  "Output ONLY the translated transcript. No preamble, no quotes, no markdown.",
].join("\n");

async function translateChunk(apiKey: string, chunk: string): Promise<{ text: string; tokens: number }> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.15,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: chunk },
      ],
      max_tokens: Math.min(4096, Math.ceil(chunk.length / 2) + 400),
    }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new Error(typeof body?.error?.message === "string" ? body.error.message : "OpenAI request failed");
  }
  const content = String(body?.choices?.[0]?.message?.content ?? "").trim();
  const u = extractOpenAIUsageFromChatCompletion(body);
  return { text: content || chunk, tokens: u?.totalTokens ?? 0 };
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const chunks = chunkTranscript(parsed.data.text);
  const estTokens = Math.min(48_000, 400 + chunks.length * 2200);
  const quota = await assertOpenAIQuotaAvailable(supabase, user.id, estTokens);
  if (!quota.ok) {
    return NextResponse.json(
      { error: "AI quota exceeded for this month.", code: "quota_exceeded", kind: "openai" },
      { status: 402 },
    );
  }

  try {
    const parts: string[] = [];
    let totalTokens = 0;
    for (const ch of chunks) {
      const { text, tokens } = await translateChunk(apiKey, ch);
      parts.push(text);
      totalTokens += tokens;
    }
    if (totalTokens > 0) {
      await recordOpenAITokenUsage(supabase, user.id, totalTokens);
    }
    const english = parts.join("\n").trim();
    return NextResponse.json({ english: english || parsed.data.text.trim() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Translation failed" },
      { status: 500 },
    );
  }
}
