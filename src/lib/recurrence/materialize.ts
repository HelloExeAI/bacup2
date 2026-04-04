import type { SupabaseClient } from "@supabase/supabase-js";

import { formatRecurrenceLabel } from "@/lib/recurrence/labels";
import { firstDueOnOrAfter, nextDueAfter } from "@/lib/recurrence/nextDue";
import { RecurrenceRuleSchema, type RecurrenceRule } from "@/lib/recurrence/types";

function ymdTodayLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function materializeNextAfterComplete(
  supabase: SupabaseClient,
  userId: string,
  completed: { series_id: string | null; due_date: string },
): Promise<{ created: boolean }> {
  if (!completed.series_id) return { created: false };

  const { data: series, error: sErr } = await supabase
    .from("task_recurrence_series")
    .select("*")
    .eq("id", completed.series_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (sErr || !series || series.status !== "active") return { created: false };

  const parsed = RecurrenceRuleSchema.safeParse(series.recurrence_rule);
  if (!parsed.success) return { created: false };
  const rule = parsed.data;

  const nextYmd = nextDueAfter(completed.due_date, rule);
  const reminderTime =
    typeof series.reminder_time === "string" && /^\d{2}:\d{2}$/.test(series.reminder_time)
      ? series.reminder_time
      : "09:00";
  const label = formatRecurrenceLabel(rule);

  const { error: insErr } = await supabase.from("tasks").insert({
    user_id: userId,
    title: series.title,
    description: series.description,
    due_date: nextYmd,
    due_time: reminderTime,
    type: series.type,
    assigned_to: series.assigned_to,
    status: "pending",
    completed_at: null,
    source: "recurring",
    series_id: series.id,
    recurrence_label: label,
  });

  if (insErr) {
    if (String(insErr.message).toLowerCase().includes("duplicate") || insErr.code === "23505") {
      return { created: false };
    }
    console.error("[recurrence] materialize after complete", insErr.message);
    return { created: false };
  }

  return { created: true };
}

export async function ensurePendingInstanceAfterDelete(
  supabase: SupabaseClient,
  userId: string,
  seriesId: string,
): Promise<{ created: boolean }> {
  const { data: series, error: sErr } = await supabase
    .from("task_recurrence_series")
    .select("*")
    .eq("id", seriesId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sErr || !series || series.status !== "active") return { created: false };

  const { data: pend } = await supabase
    .from("tasks")
    .select("id")
    .eq("user_id", userId)
    .eq("series_id", seriesId)
    .eq("status", "pending")
    .limit(1);

  if (pend && pend.length > 0) return { created: false };

  const parsed = RecurrenceRuleSchema.safeParse(series.recurrence_rule);
  if (!parsed.success) return { created: false };
  const rule = parsed.data as RecurrenceRule;

  const { data: doneRows } = await supabase
    .from("tasks")
    .select("due_date")
    .eq("user_id", userId)
    .eq("series_id", seriesId)
    .eq("status", "done")
    .order("due_date", { ascending: false })
    .limit(1);

  const anchor = typeof series.anchor_due_date === "string" ? series.anchor_due_date : "";
  const today = ymdTodayLocal();

  let nextYmd: string;
  if (doneRows && doneRows.length > 0 && typeof doneRows[0]?.due_date === "string") {
    nextYmd = nextDueAfter(doneRows[0].due_date, rule);
  } else {
    nextYmd = firstDueOnOrAfter(anchor || today, rule, today);
  }

  const reminderTime =
    typeof series.reminder_time === "string" && /^\d{2}:\d{2}$/.test(series.reminder_time)
      ? series.reminder_time
      : "09:00";

  const { error: insErr } = await supabase.from("tasks").insert({
    user_id: userId,
    title: series.title,
    description: series.description,
    due_date: nextYmd,
    due_time: reminderTime,
    type: series.type,
    assigned_to: series.assigned_to,
    status: "pending",
    completed_at: null,
    source: "recurring",
    series_id: series.id,
    recurrence_label: formatRecurrenceLabel(rule),
  });

  if (insErr) {
    console.error("[recurrence] ensure after delete", insErr.message);
    return { created: false };
  }
  return { created: true };
}

/**
 * Ensures every active series has exactly one pending instance (idempotent).
 * Use after deploys, failed materialize, or on a schedule.
 */
export async function reconcileAllActiveSeriesForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ checked: number; created: number }> {
  const { data: rows, error } = await supabase
    .from("task_recurrence_series")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    console.error("[recurrence] reconcile list", error.message);
    return { checked: 0, created: 0 };
  }

  let created = 0;
  const list = rows ?? [];
  for (const r of list) {
    const res = await ensurePendingInstanceAfterDelete(supabase, userId, r.id);
    if (res.created) created += 1;
  }
  return { checked: list.length, created };
}
