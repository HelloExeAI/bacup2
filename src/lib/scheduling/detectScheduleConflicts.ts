import type { Event } from "@/store/eventStore";
import type { Task } from "@/store/taskStore";
import type { TimelineItem } from "@/lib/timeline/types";

export type ConflictReason = {
  kind: "local_event" | "google" | "outlook" | "imap";
  title: string;
  sourceLabel: string;
};

export type ScheduleConflict = {
  task: Task;
  reasons: ConflictReason[];
};

function hhmmTask(t: string | null | undefined): string | null {
  if (!t) return null;
  return String(t).slice(0, 5);
}

function hhmmEventTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return String(t).slice(0, 5);
}

function hhmmFromTimedIso(iso: string | null): string | null {
  if (!iso || !iso.includes("T")) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timelineItemDescriptionKey(itemKey: string) {
  return `timeline_item_key:${itemKey}`;
}

function isTimelineItemTracked(tasks: Task[], itemKey: string): boolean {
  const descKey = timelineItemDescriptionKey(itemKey);
  return tasks.some((t) => t.description === descKey);
}

/**
 * Tasks due today whose due_time matches the same clock time as a local event or a Google/Outlook timed event.
 */
export function detectScheduleConflicts(
  todayYmd: string,
  tasks: Task[],
  localEvents: Event[],
  timelineItems: TimelineItem[] | null | undefined,
): ScheduleConflict[] {
  const pendingToday = tasks.filter((t) => t.status === "pending" && t.due_date === todayYmd);
  const out: ScheduleConflict[] = [];

  for (const task of pendingToday) {
    const tt = hhmmTask(task.due_time);
    if (!tt) continue;

    const reasons: ConflictReason[] = [];

    for (const e of localEvents) {
      if (e.date !== todayYmd) continue;
      const et = hhmmEventTime(e.time);
      if (et && et === tt) {
        reasons.push({
          kind: "local_event",
          title: e.title?.trim() || "Event",
          sourceLabel: "Calendar",
        });
      }
    }

    if (timelineItems && timelineItems.length > 0) {
      for (const it of timelineItems) {
        if (it.source !== "google" && it.source !== "outlook" && it.source !== "imap") continue;
        // If the user created a local task from this calendar item, ignore the original
        // Google/Outlook item for conflict detection (prevents self-conflicts).
        if (isTimelineItemTracked(tasks, it.key)) continue;
        const st = hhmmFromTimedIso(it.start);
        if (st && st === tt) {
          reasons.push({
            kind: it.source,
            title: it.title,
            sourceLabel:
              it.source === "google"
                ? "Google Calendar"
                : it.source === "imap"
                  ? "Connected email (CalDAV)"
                  : "Outlook",
          });
        }
      }
    }

    if (reasons.length > 0) {
      out.push({ task, reasons });
    }
  }

  return out;
}
