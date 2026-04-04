import type { TimelineItem } from "@/lib/timeline/types";

export type BusyInterval = { startMs: number; endMs: number };

function localWorkBoundsMs(dayYmd: string, startH: number, endH: number): { startMs: number; endMs: number } {
  const [y, mo, d] = dayYmd.split("-").map(Number);
  const start = new Date(y, (mo || 1) - 1, d || 1, startH, 0, 0, 0).getTime();
  const end = new Date(y, (mo || 1) - 1, d || 1, endH, 0, 0, 0).getTime();
  return { startMs: start, endMs: end };
}

/** Merge overlapping / adjacent busy ranges (1s gap tolerance). */
export function mergeIntervals(intervals: BusyInterval[]): BusyInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const out: BusyInterval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (!last || iv.startMs > last.endMs + 1000) {
      out.push({ ...iv });
    } else {
      last.endMs = Math.max(last.endMs, iv.endMs);
    }
  }
  return out;
}

const DEFAULT_TASK_BLOCK_MS = 15 * 60 * 1000;

/**
 * Calendar + timed tasks block scheduling; milestones are ignored (informational).
 * All-day events block the default work window (so we do not stack meetings on top of them).
 */
export function timelineItemsToBusyIntervals(
  items: TimelineItem[],
  dayYmd: string,
  workStartHour = 9,
  workEndHour = 18,
): BusyInterval[] {
  const work = localWorkBoundsMs(dayYmd, workStartHour, workEndHour);
  const out: BusyInterval[] = [];

  for (const item of items) {
    if (item.source === "milestone") continue;

    const s = item.start;
    if (!s) continue;

    if (!s.includes("T")) {
      out.push(work);
      continue;
    }

    const st = new Date(s).getTime();
    if (Number.isNaN(st)) continue;
    let en: number;
    if (item.end && item.end.includes("T")) {
      const et = new Date(item.end).getTime();
      en = Number.isNaN(et) ? st + DEFAULT_TASK_BLOCK_MS : Math.max(et, st + 60_000);
    } else {
      en = st + DEFAULT_TASK_BLOCK_MS;
    }

    if (en <= st) en = st + DEFAULT_TASK_BLOCK_MS;
    out.push({ startMs: st, endMs: en });
  }

  return mergeIntervals(out);
}

export function localWorkBoundsForDay(
  dayYmd: string,
  workStartHour = 9,
  workEndHour = 18,
): { startMs: number; endMs: number } {
  return localWorkBoundsMs(dayYmd, workStartHour, workEndHour);
}
