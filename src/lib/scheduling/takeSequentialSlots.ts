import { roundUpToNextQuarterHourMs } from "@/lib/datetime/quarterHour";
import type { BusyInterval } from "@/lib/scheduling/busyIntervals";
import { mergeIntervals } from "@/lib/scheduling/busyIntervals";

function overlaps(aStart: number, aEnd: number, b: BusyInterval): boolean {
  return aStart < b.endMs && aEnd > b.startMs;
}

function overlapsAny(aStart: number, aEnd: number, busy: BusyInterval[]): boolean {
  return busy.some((b) => overlaps(aStart, aEnd, b));
}

function formatHHMM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Next `count` non-overlapping slots (default 15 minutes) inside [workStartHour, workEndHour],
 * each after `nowMs`, respecting merged busy intervals. Returns HH:MM in local time.
 */
export function takeSequentialSlots(
  dayYmd: string,
  nowMs: number,
  mergedBusy: BusyInterval[],
  count: number,
  stepMinutes = 15,
  workStartHour = 9,
  workEndHour = 18,
): string[] {
  const [y, mo, d] = dayYmd.split("-").map(Number);
  const workStart = new Date(y, (mo || 1) - 1, d || 1, workStartHour, 0, 0, 0).getTime();
  const workEnd = new Date(y, (mo || 1) - 1, d || 1, workEndHour, 0, 0, 0).getTime();
  const stepMs = stepMinutes * 60 * 1000;

  let scheduled = mergeIntervals([...mergedBusy]);
  const out: string[] = [];

  let cursor = roundUpToNextQuarterHourMs(Math.max(nowMs, workStart));
  if (cursor < workStart) cursor = workStart;

  let guard = 0;
  while (out.length < count && cursor + stepMs <= workEnd && guard < 10_000) {
    guard += 1;
    const slotEnd = cursor + stepMs;

    if (!overlapsAny(cursor, slotEnd, scheduled)) {
      out.push(formatHHMM(cursor));
      scheduled = mergeIntervals([...scheduled, { startMs: cursor, endMs: slotEnd }]);
      cursor = slotEnd;
      continue;
    }

    const hits = scheduled.filter((b) => overlaps(cursor, slotEnd, b));
    const jumpTo = hits.length > 0 ? Math.max(...hits.map((h) => h.endMs)) : cursor + stepMs;
    cursor = roundUpToNextQuarterHourMs(jumpTo);
    if (cursor >= workEnd) break;
  }

  return out;
}
