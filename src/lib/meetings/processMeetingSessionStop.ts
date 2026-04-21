import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import {
  clampDueAfterMeetingEnd,
  type MeetingEndLocal,
} from "@/lib/datetime/meetingTaskDue";
import { parseTasks, type ParsedTask } from "@/modules/scratchpad/parser";

export const MeetingSessionStopBodySchema = z
  .object({
    started_at: z.string().datetime(),
    ended_at: z.string().datetime(),
    transcript: z.string().min(1).max(200_000),
    calendar_title: z.string().max(300).nullable().optional(),
    meeting_end_local: z
      .object({
        ymd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        hhmm: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .strict(),
  })
  .strict();

export type MeetingSessionStopBody = z.infer<typeof MeetingSessionStopBodySchema>;

const AI_TASK_DESCRIPTION_MAX = 2000;

function normalizeAiDescription(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, AI_TASK_DESCRIPTION_MAX);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function normalizeTaskType(v: unknown): ParsedTask["type"] {
  const s = String(v ?? "todo");
  if (s === "followup") return "followup";
  if (s === "reminder") return "reminder";
  return "todo";
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
  meetingEndLocal: MeetingEndLocal,
): Promise<{ tasks: ParsedTask[]; tokens?: number } | null> {
  const system = `You are Bacup Meeting Action Extractor.

Goal: extract only clear action items from a meeting transcript.

Rules:
- Only output JSON.
- Output an array of {title,description,type,due_date,due_time,assigned_to}.
- title: short imperative heading. Professional; rephrase—do not paste raw transcript (keep necessary proper nouns).
- description: 1–3 sentences on what to do—scope, outcome, useful context from the conversation. Do not repeat the title; no JSON inside strings.
- type must be one of: todo, followup, reminder.
- due_date must be YYYY-MM-DD or null.
- due_time must be HH:MM (24h) or null.
- Deadlines: use null for both due_date and due_time unless the transcript states a specific time or calendar day. Never invent a clock time. If you set both, they must be strictly AFTER the meeting end local wall time given in the user message (same calendar semantics as the user's device).
- assigned_to must be an empty string "" for every item (the user will assign later).
- If an item is a decision, status update, or discussion, DO NOT include it.
- If nothing is actionable, return [].
`;

  const user = `Meeting ended (user local wall clock): date=${meetingEndLocal.ymd} time=${meetingEndLocal.hhmm}

Transcript:\n${transcript.slice(0, 40_000)}`;

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
      max_tokens: 1400,
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

  const normalized: ParsedTask[] = parsed
    .filter(isRecord)
    .map((x) => ({
      title: String(x.title ?? "").trim().slice(0, 120),
      description: normalizeAiDescription(x.description),
      type: normalizeTaskType(x.type),
      assigned_to: "",
      due_date: typeof x.due_date === "string" ? x.due_date : null,
      due_time: typeof x.due_time === "string" ? x.due_time : null,
    }))
    .filter((t) => t.title.length > 0);

  const usage = extractOpenAIUsageFromChatCompletion(j);
  return { tasks: normalized, tokens: usage?.totalTokens };
}

export type MeetingSessionStopSuccess = {
  parent_note_id: string;
  child_note_id: string;
  tasks: Record<string, unknown>[];
};

export type MeetingSessionStopFailure = { status: number; error: string };

/**
 * Shared implementation for web (cookie session) and mobile (Bearer) meeting stop endpoints.
 */
export async function processMeetingSessionStop(
  supabase: SupabaseClient,
  user: User,
  parsed: MeetingSessionStopBody,
): Promise<MeetingSessionStopSuccess | MeetingSessionStopFailure> {
  const { started_at, transcript, meeting_end_local } = parsed;
  const meetingYmd = meeting_end_local.ymd;

  const apiKey = process.env.OPENAI_API_KEY?.trim() || null;

  const calendarTitle = parsed.calendar_title?.trim() ? parsed.calendar_title.trim() : null;

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
    if (insErr) return { status: 500, error: insErr.message };
    parentId = String(ins?.id);
  }

  const transcriptHeader =
    `Transcript (${meetingYmd}) — ${started_at.slice(11, 16)} to ${meeting_end_local.hhmm}`.trim();
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
  if (childErr) return { status: 500, error: childErr.message };

  let extracted: ParsedTask[] = [];
  let actionTokens = 0;

  if (apiKey) {
    const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 2500);
    if (quota.ok) {
      const resAi = await extractActionsOpenAI(apiKey, transcript, meeting_end_local);
      if (resAi?.tasks) {
        extracted = resAi.tasks;
        actionTokens = resAi.tokens ?? 0;
      }
    }
  }

  if (extracted.length === 0) {
    extracted = parseTasks(transcript).map((t) => ({ ...t, assigned_to: "" }));
  }

  const tasksToInsert = extracted.slice(0, 50).map((t) => {
    const { due_date, due_time } = clampDueAfterMeetingEnd(t.due_date, t.due_time, meeting_end_local);
    return {
      user_id: user.id,
      title: t.title,
      description: t.description?.trim() ? t.description.trim() : null,
      due_date,
      due_time,
      type: t.type,
      assigned_to: "",
      status: "pending",
      completed_at: null,
      source: "scratchpad",
    };
  });

  let savedTasks: Record<string, unknown>[] = [];
  if (tasksToInsert.length > 0) {
    const { data: tasks, error: taskErr } = await supabase.from("tasks").insert(tasksToInsert).select("*");
    if (taskErr) return { status: 500, error: taskErr.message };
    savedTasks = (tasks ?? []) as Record<string, unknown>[];
  }

  const totalTokens = titleTokens + actionTokens;
  if (totalTokens > 0) {
    await recordOpenAITokenUsage(supabase, user.id, totalTokens);
  }

  return {
    parent_note_id: parentId,
    child_note_id: String(child?.id ?? ""),
    tasks: savedTasks,
  };
}
