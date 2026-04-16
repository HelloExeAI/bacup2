import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { parseTasks } from "@/modules/scratchpad/parser";
import { defaultDueTimeQuarterHour } from "@/lib/datetime/quarterHour";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    started_at: z.string().datetime(),
    ended_at: z.string().datetime(),
    transcript: z.string().min(1).max(200_000),
    calendar_title: z.string().max(300).nullable().optional(),
  })
  .strict();

function ymdLocalFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fallbackMeetingTitle(transcript: string): string {
  const firstLine = transcript.split("\n").map((l) => l.trim()).find(Boolean) ?? "Meeting";
  const words = firstLine.split(/\s+/).slice(0, 8).join(" ");
  return (words || "Meeting").slice(0, 60);
}

async function summarizeMeetingTitleOpenAI(
  apiKey: string,
  transcript: string,
): Promise<{ title: string; tokens?: number } | null> {
  const system =
    "You generate short meeting titles. Output ONLY the title. Max 60 characters. No quotes. No emojis.";
  const user = `Transcript:\n${transcript.slice(0, 24_000)}`;

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
        { role: "user", content: user },
      ],
      max_tokens: 80,
    }),
  });

  const j = await resp.json().catch(() => null);
  if (!resp.ok) return null;
  const content: string = j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.message?.text ?? "";
  const title = String(content || "")
    .trim()
    .replace(/^["'“”]+/, "")
    .replace(/["'“”]+$/, "")
    .slice(0, 60);
  if (!title) return null;
  const usage = extractOpenAIUsageFromChatCompletion(j);
  return { title, tokens: usage?.totalTokens };
}

async function extractActionsOpenAI(
  apiKey: string,
  transcript: string,
): Promise<{ tasks: ReturnType<typeof parseTasks>; tokens?: number } | null> {
  const system = `You are Bacup Meeting Action Extractor.

Goal: extract only clear action items from a meeting transcript.

Rules:
- Only output JSON.
- Output an array of {title,type,due_date,due_time,assigned_to}.
- title must be concise, imperative, professional.
- type must be one of: todo, followup, reminder.
- due_date must be YYYY-MM-DD or null.
- due_time must be HH:MM (24h) or null.
- assigned_to must be an empty string \"\" (unassigned) for every item (the user will assign later).
- If an item is a decision, status update, or discussion, DO NOT include it.
- If nothing is actionable, return [].
`;

  const user = `Transcript:\n${transcript.slice(0, 40_000)}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 700,
    }),
  });

  const j = await resp.json().catch(() => null);
  if (!resp.ok) return null;
  const content: string = j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.message?.text ?? "";
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const normalized = parsed
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      title: String((x as any).title ?? "").trim().slice(0, 120),
      description: "",
      type: (String((x as any).type ?? "todo") as any) === "followup" ? "followup" : (String((x as any).type ?? "todo") as any) === "reminder" ? "reminder" : "todo",
      assigned_to: "",
      due_date: typeof (x as any).due_date === "string" ? String((x as any).due_date) : null,
      due_time: typeof (x as any).due_time === "string" ? String((x as any).due_time) : null,
    }))
    .filter((t) => t.title.length > 0);

  const usage = extractOpenAIUsageFromChatCompletion(j);
  return { tasks: normalized as any, tokens: usage?.totalTokens };
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

  const { started_at, ended_at, transcript } = parsed.data;
  const meetingYmd = ymdLocalFromIso(started_at);

  const apiKey = process.env.OPENAI_API_KEY?.trim() || null;

  const calendarTitle = parsed.data.calendar_title?.trim() ? parsed.data.calendar_title.trim() : null;

  // Title selection: calendar if present; else summarize after meeting ends; else fallback.
  let meetingTitle = calendarTitle ?? "";
  let titleTokens = 0;
  if (!meetingTitle) {
    if (apiKey) {
      const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 800);
      if (quota.ok) {
        const sum = await summarizeMeetingTitleOpenAI(apiKey, transcript);
        if (sum?.title) {
          meetingTitle = sum.title;
          titleTokens = sum.tokens ?? 0;
        }
      }
    }
    if (!meetingTitle) meetingTitle = `Meeting — ${meetingYmd} ${started_at.slice(11, 16)}`;
  }

  // Create/find parent meeting note by title (simple MVP: dedupe by same title).
  let parentId: string | null = null;
  {
    const { data: existing } = await supabase
      .from("notes")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", "meeting")
      .eq("content", meetingTitle)
      .maybeSingle();
    if (existing?.id) parentId = String(existing.id);
  }

  if (!parentId) {
    const { data: ins, error: insErr } = await supabase
      .from("notes")
      .insert({ user_id: user.id, content: meetingTitle, type: "meeting", parent_id: null, parsed: false })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    parentId = String(ins?.id);
  }

  const transcriptHeader = `Transcript (${meetingYmd}) — ${started_at.slice(11, 16)} to ${ended_at.slice(11, 16)}`.trim();
  const transcriptBody = `${transcriptHeader}\n\n${transcript.trim()}`.slice(0, 200_000);

  const { data: child, error: childErr } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      content: transcriptBody,
      type: "meeting_transcript",
      parent_id: parentId,
      parsed: false,
    })
    .select("id")
    .single();
  if (childErr) return NextResponse.json({ error: childErr.message }, { status: 500 });

  // Extract actions (OpenAI first, fallback parser).
  let extracted = [] as ReturnType<typeof parseTasks>;
  let actionTokens = 0;

  if (apiKey) {
    const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 2500);
    if (quota.ok) {
      const resAi = await extractActionsOpenAI(apiKey, transcript);
      if (resAi?.tasks) {
        extracted = resAi.tasks as any;
        actionTokens = resAi.tokens ?? 0;
      }
    }
  }

  if (extracted.length === 0) {
    extracted = parseTasks(transcript).map((t) => ({ ...t, assigned_to: "" })) as any;
  }

  const tasksToInsert = extracted.slice(0, 50).map((t) => ({
    user_id: user.id,
    title: t.title,
    description: t.description || null,
    due_date: t.due_date ?? meetingYmd,
    due_time: t.due_time ?? defaultDueTimeQuarterHour(),
    type: t.type,
    assigned_to: "",
    status: "pending",
    completed_at: null,
    source: "scratchpad",
  }));

  let savedTasks: any[] = [];
  if (tasksToInsert.length > 0) {
    const { data: tasks, error: taskErr } = await supabase.from("tasks").insert(tasksToInsert).select("*");
    if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });
    savedTasks = tasks ?? [];
  }

  const totalTokens = titleTokens + actionTokens;
  if (totalTokens > 0) {
    await recordOpenAITokenUsage(supabase, user.id, totalTokens);
  }

  return NextResponse.json({
    parent_note_id: parentId,
    child_note_id: child?.id,
    tasks: savedTasks,
  });
}

