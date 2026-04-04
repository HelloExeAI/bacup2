import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchGoogleCalendarForBrain } from "./googleCalendarFetcher";
import { buildWeekWindow, longGregorianDate } from "./temporal";
import type { BrainLayerChunk, NormalizedCalendarRow, TaskBrainRow, WeekWindow } from "./types";

function truncate(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function formatCalendarLine(r: NormalizedCalendarRow): string {
  const tm = r.time ? r.time : "all-day";
  const src = r.source === "google" ? `google${r.accountEmail ? `(${r.accountEmail})` : ""}` : "bacup";
  const rep = r.isRecurringInstance ? " [repeated]" : "";
  return `- ${r.date} ${tm}: ${truncate(r.title, 180)} · ${src}${rep}`;
}

function groupByDate(rows: NormalizedCalendarRow[]): Map<string, NormalizedCalendarRow[]> {
  const m = new Map<string, NormalizedCalendarRow[]>();
  for (const r of rows) {
    const arr = m.get(r.date) ?? [];
    arr.push(r);
    m.set(r.date, arr);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => (a.time ?? "00:00").localeCompare(b.time ?? "00:00"));
  }
  return m;
}

function taskIsRepeated(t: TaskBrainRow): boolean {
  if (t.series_id) return true;
  if (t.source === "recurring") return true;
  if (t.recurrence_label && t.recurrence_label.trim()) return true;
  return false;
}

function formatTaskLine(t: TaskBrainRow): string {
  const bits = [
    `- [${t.status}] ${truncate(t.title, 200)}`,
    `type=${t.type ?? "todo"}`,
    t.due_date ? `due=${t.due_date}` : null,
    t.due_time ? `time=${t.due_time}` : null,
    t.assigned_to ? `assignee=${t.assigned_to}` : null,
    t.source ? `source=${t.source}` : null,
    taskIsRepeated(t) ? "[repeated]" : null,
    t.recurrence_label ? `series=${truncate(t.recurrence_label, 80)}` : null,
  ];
  return bits.filter(Boolean).join(" · ");
}

/**
 * Core "operating brain" markdown: temporal anchor, contract, today calendar, 7-day runway, tasks.
 * Supplementary context (scratchpad, milestones, …) is appended by `buildWorkspaceContext`.
 */
export async function assembleBrainLayers(
  supabase: SupabaseClient,
  userId: string,
  timezone: string,
): Promise<{ chunks: BrainLayerChunk[]; week: WeekWindow }> {
  const week = buildWeekWindow(timezone);
  const { today, weekEnd, days } = week;

  const chunks: BrainLayerChunk[] = [];

  chunks.push({
    id: "L0_temporal_anchor",
    title: "L0 — Current moment (authoritative)",
    body: [
      `User timezone: "${timezone}".`,
      `TODAY: ${today} — ${longGregorianDate(today)}`,
      `TOMORROW: ${week.tomorrow} — ${longGregorianDate(week.tomorrow)}`,
      `Rolling 7-day window for "this week" in answers: ${today} through ${weekEnd} (inclusive).`,
      `Rule: Say a task is "due today" only if due= equals ${today}. Never relabel another due= as "today".`,
    ].join("\n"),
  });

  chunks.push({
    id: "L1_operating_contract",
    title: "L1 — Operating brain contract",
    body: [
      "This block defines how Bacup expects you to reason; users should not have to repeat it.",
      "TODAY'S PRIORITY: Combine (a) every calendar event on TODAY from L2, (b) every task with due=TODAY from L4, (c) repeated items are explicitly tagged [repeated].",
      "WEEKLY PRIORITY: Use L3 — seven separate day buckets. For each date, merge calendar + tasks due that date. Call out [repeated] where applicable.",
      "If a section is empty, say so briefly rather than inventing commitments.",
      "Bacup DB events (source bacup) are usually task-linked timeline mirrors; Google rows are external calendar.",
    ].join("\n"),
  });

  const { data: bacupRaw } = await supabase
    .from("events")
    .select("title,date,time,linked_task_id")
    .eq("user_id", userId)
    .gte("date", week.weekStart)
    .lte("date", week.weekEnd)
    .order("date", { ascending: true })
    .order("time", { ascending: true, nullsFirst: false })
    .limit(200);

  const linkedIds = [...new Set((bacupRaw ?? []).map((e) => e.linked_task_id).filter(Boolean))] as string[];
  let linkedSeries = new Set<string>();
  if (linkedIds.length > 0) {
    const { data: meta } = await supabase.from("tasks").select("id,series_id").in("id", linkedIds);
    for (const row of meta ?? []) {
      if (row.series_id) linkedSeries.add(row.id as string);
    }
  }

  const bacupRows: NormalizedCalendarRow[] = (bacupRaw ?? []).map((e) => {
    const tid = e.linked_task_id as string | null;
    const timeStr = e.time != null ? String(e.time).slice(0, 5) : null;
    return {
      source: "bacup" as const,
      title: String(e.title ?? ""),
      date: String(e.date),
      time: timeStr,
      isRecurringInstance: Boolean(tid && linkedSeries.has(tid)),
      linkedTaskId: tid,
    };
  });

  const { data: gAccs } = await supabase
    .from("user_connected_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "google");

  const googleRows: NormalizedCalendarRow[] = [];
  const googleNotices: string[] = [];
  for (const acc of gAccs ?? []) {
    const g = await fetchGoogleCalendarForBrain(supabase, userId, {
      timezone,
      inclusiveStart: week.weekStart,
      inclusiveEnd: week.weekEnd,
      accountId: acc.id as string,
    });
    googleRows.push(...g.rows);
    if (g.notice) googleNotices.push(g.notice);
  }

  const merged = [...bacupRows, ...googleRows].sort((a, b) =>
    `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`),
  );
  const byDay = groupByDate(merged);
  const todayCal = byDay.get(today) ?? [];

  const l2Body = [
    `All calendar sources for TODAY only (${today}).`,
    todayCal.length
      ? todayCal.map(formatCalendarLine).join("\n")
      : "(No calendar events in Bacup or Google for this date in the fetched window.)",
    googleNotices.length ? `\nNotes: ${[...new Set(googleNotices)].join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  chunks.push({
    id: "L2_today_calendar",
    title: "L2 — Today's calendar (Bacup + Google)",
    body: l2Body,
  });

  const l3Lines: string[] = [
    `Seven-day runway (${days[0]} … ${days[6]}), one block per date. Merge calendar + tasks (tasks appear again in L4 by date).`,
  ];
  for (const d of days) {
    const label = d === today ? `${d} (TODAY)` : d;
    const evs = byDay.get(d) ?? [];
    l3Lines.push(`\n→ ${label} — ${longGregorianDate(d)}`);
    l3Lines.push(
      evs.length ? evs.map(formatCalendarLine).join("\n") : "(no calendar events this day in snapshot)",
    );
  }

  chunks.push({
    id: "L3_week_calendar",
    title: "L3 — Week runway (7-day calendar)",
    body: l3Lines.join("\n"),
  });

  const { data: tasksRaw } = await supabase
    .from("tasks")
    .select("title,status,type,due_date,due_time,assigned_to,source,series_id,recurrence_label")
    .eq("user_id", userId)
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(160);

  const tasks = (tasksRaw ?? []) as TaskBrainRow[];
  const pending = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done").slice(0, 20);

  const dueToday = pending.filter((t) => t.due_date === today);
  const dueInWeek = pending.filter(
    (t) => t.due_date != null && t.due_date >= today && t.due_date <= weekEnd,
  );
  const otherPending = pending.filter(
    (t) => t.due_date == null || t.due_date < today || t.due_date > weekEnd,
  );

  const { data: seriesRows } = await supabase
    .from("task_recurrence_series")
    .select("title,status,type,anchor_due_date")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(40);

  const l4Parts: string[] = [
    "### Due TODAY (tasks)",
    dueToday.length ? dueToday.map(formatTaskLine).join("\n") : "(none)",
    "\n### Due in the 7-day window (grouped by due date)",
  ];

  for (const d of days) {
    const dayTasks = dueInWeek.filter((t) => t.due_date === d);
    if (dayTasks.length === 0) continue;
    l4Parts.push(`\n→ ${d}${d === today ? " (TODAY)" : ""}:`);
    l4Parts.push(dayTasks.map(formatTaskLine).join("\n"));
  }

  if (dueInWeek.length === 0) {
    l4Parts.push("(no pending tasks due in the 7-day window)");
  }

  l4Parts.push("\n### Other pending (beyond this week or no due date)");
  l4Parts.push(otherPending.length ? otherPending.map(formatTaskLine).join("\n") : "(none)");

  l4Parts.push("\n### Recently completed (sample)");
  l4Parts.push(done.length ? done.map(formatTaskLine).join("\n") : "(none)");

  l4Parts.push("\n### Active recurrence series (templates)");
  if (seriesRows?.length) {
    l4Parts.push(
      seriesRows
        .map((s) => {
          const anchor = s.anchor_due_date ? ` · anchor=${s.anchor_due_date}` : "";
          return `- [repeated series] ${truncate(String(s.title), 200)} · type=${s.type ?? "todo"}${anchor}`;
        })
        .join("\n"),
    );
  } else {
    l4Parts.push("(no active recurrence series)");
  }

  chunks.push({
    id: "L4_tasks_runway",
    title: "L4 — Tasks runway (today, week, recurring)",
    body: l4Parts.join("\n"),
  });

  return { chunks, week };
}

export function renderBrainMarkdown(chunks: BrainLayerChunk[]): string {
  return chunks.map((c) => `## ${c.title}\n${c.body}`).join("\n\n");
}
