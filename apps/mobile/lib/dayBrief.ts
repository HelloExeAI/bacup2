import { ymdToday } from "@/lib/taskStats";

/** Minimal shapes for overview briefing (mirrors web `buildTodayActionBriefLines`). */
export type BriefTaskInput = {
  status: string;
  due_date: string;
  due_time?: string | null;
  type?: string | null;
  title: string;
};

export type BriefEventInput = {
  date: string | null;
  time?: string | null;
  title?: string | null;
};

function briefTimeToMinutes(t: string | null | undefined): number | null {
  if (t == null || String(t).trim() === "") return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  return h * 60 + min;
}

function normBriefTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/["'`]+/g, "")
    .trim();
}

function briefDedupeKey(timeMins: number | null, title: string): string {
  return `${timeMins == null ? "untimed" : String(timeMins)}|${normBriefTitle(title)}`;
}

/** One line per timed or untimed item for today (tasks due today + calendar). */
export function buildTodayActionBriefLines(
  tasks: BriefTaskInput[],
  events: BriefEventInput[],
  todayYmd: string,
  opts?: { maxLines?: number },
): string[] {
  const maxLines = opts?.maxLines ?? 8;
  const pendingToday = tasks.filter((t) => t.status === "pending" && t.due_date === todayYmd);
  const calToday = events.filter((e) => e.date === todayYmd);

  const timeLabel = (mins: number | null) =>
    mins == null ? "—" : `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  const baseUntimed = 24 * 60 + 10_000;

  type BriefEntry = { sort: number; line: string; source: "task" | "calendar" };
  const byKey = new Map<string, BriefEntry>();

  for (const t of pendingToday) {
    const mins = briefTimeToMinutes(t.due_time);
    const sort = mins ?? baseUntimed + 50_000;
    const tl = mins == null ? "Today" : String(t.due_time ?? "").slice(0, 5);
    const ty = t.type ?? "todo";
    const kind = ty === "followup" ? "Follow-up" : ty === "reminder" ? "Reminder" : "Todo";
    const title = (t.title ?? "").trim() || "Untitled";
    const key = briefDedupeKey(mins, title);
    byKey.set(key, {
      sort,
      line: `${tl} · ${title} · ${kind}`,
      source: "task",
    });
  }

  for (const e of calToday) {
    const mins = briefTimeToMinutes(e.time);
    const sort = mins ?? baseUntimed;
    const tl = timeLabel(mins);
    const title = ((e.title ?? "") || "Untitled event").trim() || "Untitled event";
    const key = briefDedupeKey(mins, title);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        sort,
        line: `${tl} · ${title} · Calendar`,
        source: "calendar",
      });
      continue;
    }
    if (existing.source === "task") {
      if (!/ · Calendar$/.test(existing.line)) {
        existing.line = existing.line.replace(
          / · (Follow-up|Reminder|Todo)$/,
          (_m, k: string) => ` · ${k} · Calendar`,
        );
      }
    }
  }

  const rows = [...byKey.values()];
  rows.sort((a, b) => a.sort - b.sort || a.line.localeCompare(b.line));

  if (rows.length === 0) {
    return ["No tasks due today and no calendar events."];
  }

  const extra = rows.length - maxLines;
  const out = rows.slice(0, maxLines).map((r) => r.line);
  if (extra > 0) {
    out.push(`…and ${extra} more today.`);
  }
  return out;
}

export function todayFocusLines(tasks: BriefTaskInput[], events: BriefEventInput[]): string[] {
  return buildTodayActionBriefLines(tasks, events, ymdToday(), { maxLines: 8 });
}
