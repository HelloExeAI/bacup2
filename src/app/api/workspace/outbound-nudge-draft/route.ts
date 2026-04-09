import { NextResponse } from "next/server";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { OverviewLensSchema } from "@/lib/workspace/overviewLens";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const OPENAI_MS = 1750;

const ChannelSchema = z.enum(["email", "chat"]);

const BodySchema = z.object({
  channel: ChannelSchema,
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

function clampText(s: string, max: number): string {
  const t = s.replace(/\r/g, "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function fallbackDraft(
  channel: z.infer<typeof ChannelSchema>,
  lens: z.infer<typeof OverviewLensSchema>,
  kpis: z.infer<typeof BodySchema>["kpis"],
  openCrossTeamDeps: number,
): string {
  const { overdue, todaysLoad, waitingFollowups, activePriorities, pendingDecisions } = kpis;
  const deps = openCrossTeamDeps > 0 ? ` There are ${openCrossTeamDeps} open cross-team dependencies.` : "";

  if (channel === "chat") {
    const core =
      lens === "followups" && waitingFollowups > 0
        ? `Quick ping: can you confirm status on your open items? I show ${waitingFollowups} follow-ups on my side.`
        : lens === "overdue" && overdue > 0
          ? `Heads up—I'm clearing ${overdue} overdue on my side. Anything you need from me today?`
          : lens === "decisions" && pendingDecisions > 0
            ? `Need a fast decision on ${pendingDecisions} open leadership items—can we sync for 10m?`
            : `Quick check-in: I'm juggling ${todaysLoad} due today, ${overdue} overdue, ${waitingFollowups} follow-ups.${deps} What do you need from me?`;
    return clampText(core, 420);
  }

  // email
  const subj =
    lens === "decisions"
      ? "Quick sync on open decisions"
      : lens === "followups"
        ? "Following up on open threads"
        : "Quick operating update";

  const body = [
    `Hi —`,
    ``,
    `Sharing a snapshot from my Bacup Overview: ${overdue} overdue, ${todaysLoad} due today, ${waitingFollowups} follow-ups, ${activePriorities} priority todos, ${pendingDecisions} pending decisions.${deps}`,
    ``,
    `Let me know what you need from me to keep things moving this week.`,
    ``,
    `Thanks,`,
  ].join("\n");

  return `Subject: ${subj}\n\n${body}`;
}

function channelRules(channel: z.infer<typeof ChannelSchema>): string {
  if (channel === "chat") {
    return `Write ONE short message for SMS/WhatsApp-style chat (max ~350 characters total).
- No subject line, no markdown, no bullet lists unless tiny.
- Friendly, direct, professional.
- Do not invent names, companies, or private facts.`;
  }
  return `Write ONE email-ready block the user can paste into their mail client.
- Start with "Subject: ..." on the first line, then a blank line, then the body.
- 3–6 short paragraphs max; professional, warm, concise.
- Do not invent names, companies, or private facts; you may say "team" or "folks".`;
}

function lensHint(lens: z.infer<typeof OverviewLensSchema>): string {
  switch (lens) {
    case "overdue":
      return "Angle: unblock overdue work and ask for what you need from others.";
    case "todaysLoad":
      return "Angle: protect today's commitments and set expectations.";
    case "followups":
      return "Angle: close loops and request updates on waiting threads.";
    case "priorities":
      return "Angle: align on what matters most this week.";
    case "decisions":
      return "Angle: request timely input on pending leadership decisions.";
    case "all":
    default:
      return "Angle: balanced operating update and offer to help.";
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

  const { channel, lens, kpis, openCrossTeamDeps = 0, dayBriefLines } = parsed.data;
  const fallback = fallbackDraft(channel, lens, kpis, openCrossTeamDeps);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ text: fallback, source: "fallback" as const, ms: Date.now() - started });
  }

  const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 1100);
  if (!quota.ok) {
    return NextResponse.json({
      text: fallback,
      source: "fallback" as const,
      notice: "quota_exceeded" as const,
      ms: Date.now() - started,
    });
  }

  const system = `You are Bacup Overview "Outbound nudge" for a busy founder.
The user will paste your output into email or chat — nothing is sent automatically.

${channelRules(channel)}
${lensHint(lens)}

Rules:
- No emojis unless channel is chat and a single one fits (prefer none).
- Reference KPI counts from the JSON when it helps credibility.
- Plain text only.`;

  const userMsg = `Channel: ${channel}\nLens: ${lens}\nContext JSON:\n${JSON.stringify({
    kpis,
    openCrossTeamDeps,
    ...(dayBriefLines?.length ? { dayBriefLines } : {}),
  })}`;

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
        temperature: 0.35,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        max_tokens: channel === "chat" ? 200 : 380,
      }),
    });

    clearTimeout(kill);

    const body = await resp.json().catch(() => null);
    if (!resp.ok) {
      return NextResponse.json({
        text: fallback,
        source: "fallback" as const,
        notice: "openai_error" as const,
        ms: Date.now() - started,
      });
    }

    const u = extractOpenAIUsageFromChatCompletion(body);
    if (u && u.totalTokens > 0) {
      await recordOpenAITokenUsage(supabase, user.id, u.totalTokens);
    }

    const raw: string =
      body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.message?.text ?? "";
    const text = clampText(raw, channel === "chat" ? 480 : 2800);
    if (!text.trim()) {
      return NextResponse.json({
        text: fallback,
        source: "fallback" as const,
        notice: "empty" as const,
        ms: Date.now() - started,
      });
    }

    return NextResponse.json({
      text,
      source: "openai" as const,
      ms: Date.now() - started,
    });
  } catch (e) {
    clearTimeout(kill);
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json({
      text: fallback,
      source: "fallback" as const,
      notice: aborted ? ("timeout" as const) : ("error" as const),
      ms: Date.now() - started,
    });
  }
}
