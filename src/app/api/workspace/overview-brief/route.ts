import { NextResponse } from "next/server";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  kpis: z.object({
    overdue: z.number().int().min(0),
    todaysLoad: z.number().int().min(0),
    waitingFollowups: z.number().int().min(0),
    activePriorities: z.number().int().min(0),
    pendingDecisions: z.number().int().min(0),
  }),
  openCrossTeamDeps: z.number().int().min(0).optional(),
});

function parseFiveLines(text: string): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const s = l.replace(/\s+/g, " ").trim();
      if (s.length <= 120) return s;
      return `${s.slice(0, 119).trimEnd()}…`;
    });
  return lines.slice(0, 5);
}

function fallbackLines(
  kpis: z.infer<typeof BodySchema>["kpis"],
  openCrossTeamDeps: number,
): string[] {
  const o = kpis.overdue;
  const t = kpis.todaysLoad;
  const f = kpis.waitingFollowups;
  const p = kpis.activePriorities;
  const d = kpis.pendingDecisions;
  return [
    `Overdue: ${o} — ${o ? "clear oldest first." : "nothing past due."}`,
    `Today: ${t} due — ${t ? "protect focus blocks." : "no due-today load."}`,
    `Follow-ups: ${f} — ${f ? "close loops." : "inbox quiet."}`,
    `Priorities: ${p} todos — ${p ? "pick the lever." : "queue clear."}`,
    `Decisions: ${d} pending — ${d ? "unblock the org." : "no queue."}${openCrossTeamDeps ? ` · ${openCrossTeamDeps} cross-team wait.` : ""}`,
  ];
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { kpis, openCrossTeamDeps = 0 } = parsed.data;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      lines: fallbackLines(kpis, openCrossTeamDeps),
      source: "fallback",
    });
  }

  const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 600);
  if (!quota.ok) {
    return NextResponse.json({
      lines: fallbackLines(kpis, openCrossTeamDeps),
      source: "fallback",
      notice: "quota_exceeded",
    });
  }

  const system = `You are Bacup Overview Brief for a founder workspace.
The user sees five KPI cards in this exact order: Overdue, Today's load, Follow-ups, Priorities, Pending decisions.
You must output EXACTLY 5 lines. Each line corresponds to ONE card in that order (line 1 = Overdue, line 2 = Today's load, etc.).

Rules:
- Each line starts with a short label and colon: "Overdue:", "Today:", "Follow-ups:", "Priorities:", "Decisions:"
- After the colon, add ONE crisp clause (max 12 words) that references the count when it matters.
- If a count is zero, say clearly (e.g. "none" or "clear").
- Mention cross-team open dependencies only in line 5 if the number > 0: append " · N cross-team waits" to that line.
- No emojis, no markdown bullets, no blank lines. Plain text only.`;

  const userMsg = `KPI counts (JSON): ${JSON.stringify({ ...kpis, openCrossTeamDeps })}`;

  try {
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
        max_tokens: 200,
      }),
    });

    const body = await resp.json().catch(() => null);
    if (!resp.ok) {
      return NextResponse.json({
        lines: fallbackLines(kpis, openCrossTeamDeps),
        source: "fallback",
        notice: "openai_error",
      });
    }

    const u = extractOpenAIUsageFromChatCompletion(body);
    if (u && u.totalTokens > 0) {
      await recordOpenAITokenUsage(supabase, user.id, u.totalTokens);
    }

    const text: string =
      body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.message?.text ?? "";
    const raw = parseFiveLines(text);
    const lines =
      raw.length >= 5
        ? raw.slice(0, 5)
        : [...raw, ...fallbackLines(kpis, openCrossTeamDeps)].slice(0, 5);

    return NextResponse.json({ lines, source: "openai" });
  } catch {
    return NextResponse.json({
      lines: fallbackLines(kpis, openCrossTeamDeps),
      source: "fallback",
    });
  }
}
