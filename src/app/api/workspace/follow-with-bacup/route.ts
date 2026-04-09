import { NextResponse } from "next/server";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { OverviewLensSchema } from "@/lib/workspace/overviewLens";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Hard cap so OpenAI + network stay within product <2s target (client also aborts ~1.95s). */
const OPENAI_MS = 1750;

const BodySchema = z.object({
  lens: OverviewLensSchema,
  kpis: z.object({
    overdue: z.number().int().min(0),
    todaysLoad: z.number().int().min(0),
    waitingFollowups: z.number().int().min(0),
    activePriorities: z.number().int().min(0),
    pendingDecisions: z.number().int().min(0),
  }),
  openCrossTeamDeps: z.number().int().min(0).optional(),
  dayBriefLines: z.array(z.string()).max(6).optional(),
});

function parseBullets(text: string): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .map((l) => (l.length <= 200 ? l : `${l.slice(0, 199).trimEnd()}…`));
  return lines.slice(0, 5);
}

function fallbackBullets(
  lens: z.infer<typeof OverviewLensSchema>,
  kpis: z.infer<typeof BodySchema>["kpis"],
  openCrossTeamDeps: number,
): string[] {
  const { overdue, todaysLoad, waitingFollowups, activePriorities, pendingDecisions } = kpis;
  const depNote = openCrossTeamDeps > 0 ? ` ${openCrossTeamDeps} cross-team waits—nudge owners.` : "";

  switch (lens) {
    case "overdue":
      return [
        overdue
          ? `Triage ${overdue} overdue: pick the oldest owner-facing item and unblock or reschedule.`
          : "No overdue items—keep today’s commitments from slipping.",
        "Block 25 minutes to clear one item if anything is >48h late.",
        "If scope blew up, split the task and reset the due date in Bacup.",
      ];
    case "todaysLoad":
      return [
        todaysLoad
          ? `${todaysLoad} due today—order by impact; do revenue/risk/legal first.`
          : "Nothing due today—use the slot for overdue or strategic work.",
        "Time-box deep work; batch quick replies between blocks.",
        "Decline or delegate anything that is not truly due today.",
      ];
    case "followups":
      return [
        waitingFollowups
          ? `${waitingFollowups} follow-ups open—send one closing message per thread.`
          : "Follow-up queue is quiet—confirm nothing is stuck in email.",
        "Use a single template: context + ask + deadline.",
        "Escalate anything waiting >3 days without a reply.",
      ];
    case "priorities":
      return [
        activePriorities
          ? `${activePriorities} priority todos—pick one lever that moves the week.`
          : "No stacked priorities—capture the next big rock in Bacup.",
        "Kill or merge duplicates; one owner per item.",
        "End the day with the hardest priority, not the busiest.",
      ];
    case "decisions":
      return [
        pendingDecisions
          ? `${pendingDecisions} decisions pending—decide the smallest reversible step.${depNote}`
          : `No decision queue—scan for hidden blockers.${depNote}`.trim(),
        "For each: options, tradeoff, owner, and date.",
        "If you are waiting on inputs, request them with a deadline.",
      ];
    case "all":
    default:
      return [
        overdue ? `Overdue (${overdue}): clear oldest first.` : "Overdue: clear.",
        todaysLoad ? `Today (${todaysLoad} due): protect focus blocks.` : "Today: light load—pull forward risk work.",
        waitingFollowups ? `Follow-ups (${waitingFollowups}): close loops.` : "Follow-ups: quiet.",
        `${activePriorities} priorities · ${pendingDecisions} decisions—pick one decision that unblocks the most.${depNote}`.trim(),
      ];
  }
}

function lensInstruction(lens: z.infer<typeof OverviewLensSchema>): string {
  switch (lens) {
    case "overdue":
      return "Focus only on reducing overdue backlog and preventing new slippage.";
    case "todaysLoad":
      return "Focus only on what must ship today and how to sequence it.";
    case "followups":
      return "Focus only on closing loops and nudging stalled threads.";
    case "priorities":
      return "Focus only on todo priorities and what to cut or merge.";
    case "decisions":
      return "Focus only on pending leadership decisions and cross-team waits.";
    case "all":
    default:
      return "Balance actions across all five KPI areas in priority order (overdue → decisions → today → follow-ups → priorities).";
  }
}

export async function POST(req: Request) {
  const started = Date.now();
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

  const { lens, kpis, openCrossTeamDeps = 0, dayBriefLines } = parsed.data;
  const fallback = fallbackBullets(lens, kpis, openCrossTeamDeps);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      bullets: fallback,
      source: "fallback" as const,
      ms: Date.now() - started,
    });
  }

  const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 1200);
  if (!quota.ok) {
    return NextResponse.json({
      bullets: fallback,
      source: "fallback" as const,
      notice: "quota_exceeded" as const,
      ms: Date.now() - started,
    });
  }

  const system = `You are Bacup "Follow" for a founder Overview screen.
The user has five KPIs: Overdue, Today's load, Follow-ups, Priorities, Pending decisions (plus optional cross-team open dependencies).

${lensInstruction(lens)}

Output EXACTLY 4 bullet lines. Each line:
- Starts with "- "
- One short imperative or crisp sentence (max 16 words after the dash)
- No emojis, no numbered lists, no extra blank lines
- Reference counts from the JSON when useful
- Plain text only`;

  const payload = {
    lens,
    kpis,
    openCrossTeamDeps,
    ...(dayBriefLines?.length ? { dayBriefLines } : {}),
  };

  const userMsg = `Context JSON:\n${JSON.stringify(payload)}`;

  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), OPENAI_MS);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.22,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        max_tokens: 320,
      }),
    });

    clearTimeout(kill);

    const body = await resp.json().catch(() => null);
    if (!resp.ok) {
      return NextResponse.json({
        bullets: fallback,
        source: "fallback" as const,
        notice: "openai_error" as const,
        ms: Date.now() - started,
      });
    }

    const u = extractOpenAIUsageFromChatCompletion(body);
    if (u && u.totalTokens > 0) {
      await recordOpenAITokenUsage(supabase, user.id, u.totalTokens);
    }

    const text: string =
      body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.message?.text ?? "";
    const raw = parseBullets(text);
    const bullets =
      raw.length >= 4 ? raw.slice(0, 4) : [...raw, ...fallback].slice(0, 4);

    return NextResponse.json({
      bullets,
      source: "openai" as const,
      ms: Date.now() - started,
    });
  } catch (e) {
    clearTimeout(kill);
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json({
      bullets: fallback,
      source: "fallback" as const,
      notice: aborted ? ("timeout" as const) : ("error" as const),
      ms: Date.now() - started,
    });
  }
}
