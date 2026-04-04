import type { SupabaseClient } from "@supabase/supabase-js";

import { defaultDueTimeQuarterHour } from "@/lib/datetime/quarterHour";
import { loadTodayTimeline } from "@/lib/timeline/loadTodayTimeline";
import { timelineItemsToBusyIntervals } from "@/lib/scheduling/busyIntervals";
import { takeSequentialSlots } from "@/lib/scheduling/takeSequentialSlots";

export function padDueTimeSlots(slots: string[], count: number): string[] {
  if (slots.length >= count) return slots.slice(0, count);
  const out = [...slots];
  if (out.length === 0) {
    out.push(defaultDueTimeQuarterHour());
  }
  while (out.length < count) {
    const last = out[out.length - 1]!;
    const [h, m] = last.split(":").map(Number);
    const d = new Date();
    d.setHours(h, (m || 0) + 15, 0, 0);
    out.push(
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    );
  }
  return out;
}

/**
 * Uses today's merged calendar (Google + Outlook) and existing tasks as busy time,
 * then returns the next `count` 15-minute slots after "now" inside the work window.
 * If the day is full, pads with sequential quarter-hour times from a rolling default.
 */
export async function assignSequentialDueTimesForToday(
  supabase: SupabaseClient,
  userId: string,
  dayYmd: string,
  count: number,
): Promise<string[]> {
  if (count <= 0) return [];

  const { items } = await loadTodayTimeline(supabase, userId);
  const busy = timelineItemsToBusyIntervals(items, dayYmd);
  const slots = takeSequentialSlots(dayYmd, Date.now(), busy, count);
  return padDueTimeSlots(slots, count);
}

/**
 * Next 15-minute work-window slot for `dayYmd`, treating all timeline items as busy except the
 * given task’s block (so rescheduling frees that slot).
 */
export async function suggestNextDueTimeExcludingTaskId(
  supabase: SupabaseClient,
  userId: string,
  dayYmd: string,
  excludeTaskId: string,
): Promise<string> {
  const { items } = await loadTodayTimeline(supabase, userId);
  const filtered = items.filter((it) => !(it.source === "task" && it.taskId === excludeTaskId));
  const busy = timelineItemsToBusyIntervals(filtered, dayYmd);
  const slots = takeSequentialSlots(dayYmd, Date.now(), busy, 1);
  const padded = padDueTimeSlots(slots, 1);
  return padded[0] ?? defaultDueTimeQuarterHour();
}
