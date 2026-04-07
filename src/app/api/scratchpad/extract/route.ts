import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calendarYmdInTimeZone } from "@/lib/email/calendarYmd";
import { defaultDueTimeQuarterHour } from "@/lib/datetime/quarterHour";
import { assignSequentialDueTimesForToday } from "@/lib/scheduling/assignDueTimesFromCalendar";
import { parseTasks } from "@/modules/scratchpad/parser";
import {
  normalizeTaskTypeForSelf,
  normalizeTitleFingerprint,
  resolveExtractionSchedule,
} from "@/lib/tasks/taskScheduleResolution";

const BodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  blocks: z.array(
    z.object({
      content: z.string(),
      depth: z.number().int().min(0).max(24),
    }),
  ),
});

type ExtractedTask = {
  title: string;
  type: "todo" | "followup" | "reminder";
  due_date: string | null;
  due_time: string | null;
  assigned_to: string;
};

type ExtractSource = "openai" | "fallback";
type MissingField = "recipient" | "due_date" | "due_time";

type InsertedTask = {
  id: string;
  title: string;
  type: "todo" | "followup" | "reminder";
  due_date: string;
  due_time: string;
  assigned_to: string;
  status: string;
};

function isMissingClarificationsTableError(message: string | null | undefined) {
  const msg = (message || "").toLowerCase();
  return msg.includes("sam_task_clarifications") && msg.includes("schema cache");
}

function isSelfAssignee(value: string | null | undefined) {
  return !value || value.trim().toLowerCase() === "self";
}

function professionalizeTitle(input: string) {
  let s = input.trim();
  if (!s) return s;

  // Remove bullet/check prefixes and normalize spaces.
  s = s.replace(/^\s*[\-\*\u2022]\s+/, "").replace(/^\s*\[\s?\]\s*/, "").replace(/\s+/g, " ");

  // Normalize common shorthand.
  s = s
    .replace(/\basap\b/gi, "as soon as possible")
    .replace(/\bpls\b/gi, "please")
    .replace(/\bmsg\b/gi, "message")
    .replace(/\bfu\b/gi, "follow up");

  // Ensure imperative starts are capitalized.
  const imperativeStarters = [
    "call",
    "send",
    "email",
    "message",
    "follow up",
    "schedule",
    "review",
    "prepare",
    "submit",
    "share",
    "update",
    "remind",
  ];
  const lower = s.toLowerCase();
  for (const starter of imperativeStarters) {
    if (lower.startsWith(starter)) {
      s = `${starter[0]!.toUpperCase()}${starter.slice(1)}${s.slice(starter.length)}`;
      break;
    }
  }

  // Keep concise and readable.
  s = s.replace(/[;,:]\s*$/g, "").trim();
  if (!/[.!?]$/.test(s)) s = `${s}.`;
  if (s.length > 120) s = `${s.slice(0, 119).trimEnd()}…`;
  return s;
}

function parseJsonArrayFromModel(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  // Handle markdown-fenced JSON.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }

  // Handle extra text around a JSON array.
  const first = trimmed.indexOf("[");
  const last = trimmed.lastIndexOf("]");
  if (first >= 0 && last > first) {
    const candidate = trimmed.slice(first, last + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // fall through
    }
  }

  return [];
}

function coerceTasks(json: unknown): ExtractedTask[] {
  if (!Array.isArray(json)) return [];
  const out: ExtractedTask[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const title = typeof it.title === "string" ? it.title.trim() : "";
    const typeRaw = typeof it.type === "string" ? it.type : "todo";
    const type =
      typeRaw === "followup" || typeRaw === "reminder" || typeRaw === "todo"
        ? typeRaw
        : "todo";
    const due_date =
      typeof it.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.due_date)
        ? it.due_date
        : null;
    const due_time =
      typeof it.due_time === "string" && /^\d{2}:\d{2}/.test(it.due_time)
        ? it.due_time.slice(0, 5)
        : null;
    const assigned_to =
      typeof it.assigned_to === "string" && it.assigned_to.trim()
        ? it.assigned_to.trim()
        : "self";
    if (!title) continue;
    let normalizedType: "todo" | "followup" | "reminder" =
      !isSelfAssignee(assigned_to) && type === "todo" ? "followup" : type;
    normalizedType = normalizeTaskTypeForSelf(normalizedType, assigned_to);
    out.push({
      title: professionalizeTitle(title),
      type: normalizedType,
      due_date,
      due_time,
      assigned_to,
    });
  }
  return out;
}

function looksLikePersonContext(title: string) {
  return /\b(to|with|for)\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\b/.test(title);
}

function needsRecipient(title: string) {
  return /^(send|email|message|text|call|follow up|follow-up|share|submit|report|notify)\b/i.test(title);
}

function getMissingFields(t: ExtractedTask): MissingField[] {
  const missing: MissingField[] = [];
  if (needsRecipient(t.title) && !looksLikePersonContext(t.title)) missing.push("recipient");
  if (!t.due_date) missing.push("due_date");
  if (!t.due_time) missing.push("due_time");
  return missing;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bodyJson = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const { date, blocks } = parsed.data;
  const text = blocks
    .map((b) => `${"  ".repeat(b.depth)}- ${b.content}`.trimEnd())
    .join("\n")
    .trim();

  if (!text) return NextResponse.json({ tasks: [] });

  const contentHash = createHash("sha256").update(text).digest("hex");

  const { data: existingRun, error: existingRunErr } = await supabase
    .from("scratchpad_extraction_runs")
    .select("id,status")
    .eq("user_id", user.id)
    .eq("date", date)
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (existingRunErr) {
    return NextResponse.json({ error: existingRunErr.message }, { status: 500 });
  }

  if (existingRun?.status === "succeeded") {
    const { data: existingTasks, error: existingTasksErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("extraction_run_id", existingRun.id)
      .order("created_at", { ascending: false });
    if (existingTasksErr) {
      return NextResponse.json({ error: existingTasksErr.message }, { status: 500 });
    }
    const { data: existingClarifications, error: existingClarificationsErr } = await supabase
      .from("sam_task_clarifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("source", "scratchpad")
      .eq("source_date", date)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (existingClarificationsErr && !isMissingClarificationsTableError(existingClarificationsErr.message)) {
      return NextResponse.json({ error: existingClarificationsErr.message }, { status: 500 });
    }
    return NextResponse.json({
      tasks: existingTasks ?? [],
      clarifications: existingClarificationsErr ? [] : (existingClarifications ?? []),
      source: "cached",
      run_id: existingRun.id,
    });
  }

  let runId: string;
  if (existingRun?.id) {
    runId = existingRun.id;
    const { error: updRunErr } = await supabase
      .from("scratchpad_extraction_runs")
      .update({
        status: "running",
        source: null,
        model: null,
        error: null,
        started_at: new Date().toISOString(),
        finished_at: null,
      })
      .eq("id", runId);
    if (updRunErr) {
      return NextResponse.json({ error: updRunErr.message }, { status: 500 });
    }
  } else {
    const { data: insertedRun, error: insRunErr } = await supabase
      .from("scratchpad_extraction_runs")
      .insert({
        user_id: user.id,
        date,
        content_hash: contentHash,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insRunErr || !insertedRun?.id) {
      return NextResponse.json({ error: insRunErr?.message || "Failed to create run" }, { status: 500 });
    }
    runId = insertedRun.id as string;
  }

  const system = `You are Bacup Scratchpad Task Extractor.

You will receive a daily scratchpad as an indented bullet tree.

Goal: extract actionable items into tasks.

Rules:
- Only create tasks for clearly actionable items (not notes/headings).
- If a line is informational, a thought, a meeting note, or a status update, IGNORE it.
- Only output a task when the line implies an action (e.g., starts with a verb like "Call", "Send", "Follow up", "Fix", "Schedule", "Review", "Pay", or explicitly says "Remind me").
- Do NOT create tasks for generic bullets just because they are bullets.
- If nothing is actionable, return [].
- Return JSON ONLY: an array of {title,type,due_date,due_time,assigned_to}.
- title must be rewritten in clean professional language (imperative, concise, polished).
- title must NOT copy noisy/raw phrasing from notes verbatim when it can be clarified.
- type must be one of: "todo", "followup", "reminder".
- due_date must be YYYY-MM-DD or null (never put the only deadline inside the title).
- due_time must be HH:MM (24h) or null.
- assigned_to default "self".
- If an item implies it should be done on the selected day, set due_date to the provided date.
- For "tomorrow", weekdays, or explicit times (e.g. 10:30am), compute due_date and due_time; do not rely on the title alone.
- followup only when waiting on someone else; otherwise todo.
- When the selected calendar day is today in the user's timezone, you may leave due_time null only if no time is implied — the server may assign the next free 15-minute slot using calendars.
- Keep titles short (<= 80 chars), remove trailing punctuation.`;

  const userMsg = `Selected date: ${date}

Scratchpad:
${text}`;

  let extracted: ExtractedTask[] = [];
  let source: ExtractSource = "openai";
  let modelUsed: string | null = "gpt-4o-mini";

  const quotaPre = await assertOpenAIQuotaAvailable(supabase, user.id, 6000);

  if (quotaPre.ok) {
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
          { role: "user", content: userMsg },
        ],
        max_tokens: 500,
      }),
    });

    const respJson = await resp.json().catch(() => null);
    if (!resp.ok) {
      const openaiCode = respJson?.error?.code;
      const openaiMessage = respJson?.error?.message;
      if (openaiCode === "invalid_api_key") {
        const { error: failRunErr } = await supabase
          .from("scratchpad_extraction_runs")
          .update({
            status: "failed",
            source: "openai",
            model: modelUsed,
            error: "invalid_openai_api_key",
            finished_at: new Date().toISOString(),
          })
          .eq("id", runId);
        if (failRunErr) {
          return NextResponse.json({ error: failRunErr.message }, { status: 500 });
        }
        return NextResponse.json(
          {
            error: "Invalid OPENAI_API_KEY. Update key in .env.local and restart server.",
            code: "invalid_openai_api_key",
          },
          { status: 401 },
        );
      }
      return NextResponse.json(
        { error: openaiMessage || "OpenAI request failed", code: openaiCode || "openai_error" },
        { status: 502 },
      );
    }

    const usage = extractOpenAIUsageFromChatCompletion(respJson);
    if (usage && usage.totalTokens > 0) {
      await recordOpenAITokenUsage(supabase, user.id, usage.totalTokens);
    }

    const content: string =
      respJson?.choices?.[0]?.message?.content ??
      respJson?.choices?.[0]?.message?.text ??
      "";

    extracted = coerceTasks(parseJsonArrayFromModel(content));
  } else {
    source = "fallback";
    modelUsed = null;
  }

  // Fallback: deterministic local parser when model output is empty/non-JSON (or quota skipped OpenAI).
  if (extracted.length === 0) {
    source = "fallback";
    modelUsed = null;
    const fallback = parseTasks(text)
      .slice(0, 25)
      .map((t) => {
        let ty: "todo" | "followup" | "reminder" =
          !isSelfAssignee(t.assigned_to) && t.type === "todo" ? "followup" : t.type;
        ty = normalizeTaskTypeForSelf(ty, t.assigned_to || "self");
        return {
          title: professionalizeTitle(t.title),
          type: ty,
          due_date: t.due_date,
          due_time: t.due_time,
          assigned_to: t.assigned_to || "self",
        };
      });
    extracted = fallback;
  }

  if (extracted.length === 0) return NextResponse.json({ tasks: [] });

  const { data: profileTz } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const tz = typeof profileTz?.timezone === "string" ? profileTz.timezone : "UTC";
  const todayInUserTz = calendarYmdInTimeZone(tz);
  const isSelectedToday = date === todayInUserTz;

  const seenRun = new Set<string>();
  const enriched = extracted.slice(0, 25).flatMap((t) => {
    const resolved = resolveExtractionSchedule({
      title: t.title,
      aiDueDate: t.due_date,
      aiDueTime: t.due_time,
      defaultYmd: date,
      timeZone: tz,
      allowCalendarSlots: isSelectedToday,
    });
    const row = {
      ...t,
      due_date: resolved.due_date,
      due_time: resolved.due_time,
      useCalendarSlot: resolved.useCalendarSlot,
    };
    const dedupeKey = `${normalizeTitleFingerprint(row.title)}|${row.type}|${row.due_date}`;
    if (seenRun.has(dedupeKey)) return [];
    seenRun.add(dedupeKey);
    return [row];
  });

  const normalized = enriched.map((t) => ({
    ...t,
    normalized_key: `${normalizeTitleFingerprint(t.title)}|${t.type}|${t.due_date}`,
  }));

  const { error: clearActionsErr } = await supabase
    .from("scratchpad_extracted_actions")
    .delete()
    .eq("run_id", runId);
  if (clearActionsErr) {
    return NextResponse.json({ error: clearActionsErr.message }, { status: 500 });
  }

  const { error: insActionsErr } = await supabase
    .from("scratchpad_extracted_actions")
    .insert(
      normalized.map((t) => ({
        run_id: runId,
        user_id: user.id,
        title: t.title,
        type: t.type,
        due_date: t.due_date,
        due_time: t.due_time,
        assigned_to: t.assigned_to || "self",
        normalized_key: t.normalized_key,
      })),
    );
  if (insActionsErr) {
    return NextResponse.json({ error: insActionsErr.message }, { status: 500 });
  }

  // Dedupe against existing pending scratchpad tasks for this user.
  const { data: existingTasks, error: existingTasksErr } = await supabase
    .from("tasks")
    .select("title,type,due_date,status,source")
    .eq("user_id", user.id)
    .eq("source", "scratchpad")
    .eq("status", "pending");
  if (existingTasksErr) {
    return NextResponse.json({ error: existingTasksErr.message }, { status: 500 });
  }
  const existingSet = new Set(
    (existingTasks ?? []).flatMap((t: { title?: unknown; type?: unknown; due_date?: unknown }) => {
      const title = String(t.title ?? "");
      const typ = String(t.type ?? "");
      const dd = String(t.due_date ?? "");
      return [
        `${title.toLowerCase()}|${typ}|${dd}`,
        `${normalizeTitleFingerprint(title)}|${typ}|${dd}`,
      ];
    }),
  );

  const filteredForInsert = normalized.filter((t) => !existingSet.has(t.normalized_key));
  const slotNeed = filteredForInsert.filter((t) => t.useCalendarSlot && t.due_date === date).length;
  const slotPool =
    isSelectedToday && slotNeed > 0
      ? await assignSequentialDueTimesForToday(supabase, user.id, date, slotNeed)
      : [];
  let slotIdx = 0;

  const toInsert = filteredForInsert.map((t) => {
    let dueTime = t.due_time ?? defaultDueTimeQuarterHour();
    if (t.useCalendarSlot && t.due_date === date) {
      dueTime = slotPool[slotIdx] ?? dueTime;
      slotIdx += 1;
    }
    return {
    user_id: user.id,
    title: t.title,
    description: null,
    due_date: t.due_date ?? date,
    due_time: dueTime,
    type: t.type,
    assigned_to: t.assigned_to || "self",
    status: "pending",
    completed_at: null,
    source: "scratchpad",
    extraction_run_id: runId,
  };
  });

  let inserted: InsertedTask[] = [];
  if (toInsert.length > 0) {
    const { data: insertedTasks, error: insErr } = await supabase
      .from("tasks")
      .insert(toInsert)
      .select("*");
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    inserted = (insertedTasks ?? []) as InsertedTask[];
  }

  const clarificationRows = inserted
    .map((task, idx) => {
      const fromExtract = filteredForInsert[idx];
      if (!fromExtract) return null;
      const missing = getMissingFields({
        ...fromExtract,
        due_date: task.due_date,
        due_time: task.due_time,
      });
      if (missing.length === 0) return null;
      return {
        user_id: user.id,
        task_id: task.id,
        source: "scratchpad",
        source_date: date,
        raw_text: fromExtract.title,
        rewritten_title: task.title,
        missing_fields: missing,
        status: "open",
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (clarificationRows.length > 0) {
    const { error: clarInsErr } = await supabase
      .from("sam_task_clarifications")
      .upsert(clarificationRows, { onConflict: "task_id" });
    if (clarInsErr && !isMissingClarificationsTableError(clarInsErr.message)) {
      return NextResponse.json({ error: clarInsErr.message }, { status: 500 });
    }
  }

  const { error: doneRunErr } = await supabase
    .from("scratchpad_extraction_runs")
    .update({
      status: "succeeded",
      source,
      model: modelUsed,
      error: null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (doneRunErr) {
    return NextResponse.json({ error: doneRunErr.message }, { status: 500 });
  }

  const { data: openClarifications, error: openClarificationsErr } = await supabase
    .from("sam_task_clarifications")
    .select("*")
    .eq("user_id", user.id)
    .eq("source", "scratchpad")
    .eq("source_date", date)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (openClarificationsErr && !isMissingClarificationsTableError(openClarificationsErr.message)) {
    return NextResponse.json({ error: openClarificationsErr.message }, { status: 500 });
  }

  return NextResponse.json({
    tasks: inserted,
    clarifications: openClarificationsErr ? [] : (openClarifications ?? []),
    run_id: runId,
    source,
    extracted_count: normalized.length,
    created_count: inserted.length,
  });
}

