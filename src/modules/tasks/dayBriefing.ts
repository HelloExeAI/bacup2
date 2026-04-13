import type { Task } from "@/store/taskStore";
import type { Event } from "@/store/eventStore";

type BriefTask = Pick<Task, "title" | "type" | "due_date" | "due_time" | "status">;
type BriefEvent = Pick<Event, "title" | "date" | "time">;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function ymdToday(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function hhmm(t?: string | null) {
  if (!t) return null;
  return String(t).slice(0, 5);
}

export function buildDayBriefInput(tasks: Task[], events: Event[]) {
  const today = ymdToday();
  const pending = tasks.filter((t) => t.status === "pending");
  const todayTasks = pending
    .filter((t) => t.due_date === today)
    .sort((a, b) => (a.due_time ?? "").localeCompare(b.due_time ?? ""));

  const todayEvents = events
    .filter((e) => e.date === today)
    .sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));

  return {
    today,
    today_tasks: todayTasks.slice(0, 20).map((t) => ({
      title: t.title,
      type: t.type,
      due_date: t.due_date,
      due_time: t.due_time,
      status: t.status,
    })),
    today_events: todayEvents.slice(0, 20).map((e) => ({
      title: e.title,
      date: e.date,
      time: e.time,
    })),
    backlog: pending.slice(0, 20).map((t) => ({
      title: t.title,
      type: t.type,
      due_date: t.due_date,
      due_time: t.due_time,
      status: t.status,
    })),
  };
}

/** One line per timed or untimed item for today only (tasks due today + calendar); no overdue/backlog. */
export function buildTodayActionBriefLines(
  tasks: Task[],
  events: Event[],
  todayYmd: string,
  opts?: { maxLines?: number },
): string[] {
  const maxLines = opts?.maxLines ?? 24;
  const pendingToday = tasks.filter((t) => t.status === "pending" && t.due_date === todayYmd);
  const calToday = events.filter((e) => e.date === todayYmd);

  const toMinutes = (t: string | null | undefined): number | null => {
    if (t == null || String(t).trim() === "") return null;
    const m = String(t).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Math.min(23, parseInt(m[1], 10));
    const min = Math.min(59, parseInt(m[2], 10));
    return h * 60 + min;
  };

  const timeLabel = (mins: number | null) =>
    mins == null ? "—" : `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  type Row = { sort: number; line: string };
  const rows: Row[] = [];

  const baseUntimed = 24 * 60 + 10_000;

  for (const e of calToday) {
    const mins = toMinutes(e.time);
    const sort = mins ?? baseUntimed;
    const tl = timeLabel(mins);
    rows.push({
      sort,
      line: `${tl} · ${(e.title ?? "Untitled event").trim() || "Untitled event"} · Calendar`,
    });
  }

  for (const t of pendingToday) {
    const mins = toMinutes(t.due_time);
    const sort = mins ?? baseUntimed + 50_000;
    const tl = mins == null ? "Today" : String(t.due_time ?? "").slice(0, 5);
    const kind = t.type === "followup" ? "Follow-up" : t.type === "reminder" ? "Reminder" : "Todo";
    rows.push({
      sort,
      line: `${tl} · ${t.title.trim() || "Untitled"} · ${kind}`,
    });
  }

  rows.sort((a, b) => a.sort - b.sort || a.line.localeCompare(b.line));

  if (rows.length === 0) {
    return ["No tasks due today and no calendar events."];
  }

  const extra = rows.length - maxLines;
  const out = rows.slice(0, maxLines).map((r) => r.line);
  if (extra > 0) {
    out.push(`…and ${extra} more today (open your task list or calendar for the full set).`);
  }
  return out;
}

export function fallbackDayBriefing(
  todayTasks: BriefTask[],
  todayEvents: BriefEvent[],
  backlog: BriefTask[],
) {
  const todo = todayTasks.filter((t) => t.type === "todo").length;
  const followup = todayTasks.filter((t) => t.type === "followup").length;
  const reminder = todayTasks.filter((t) => t.type === "reminder").length;
  const timed = todayTasks.filter((t) => !!t.due_time).length;

  const bullets: string[] = [];
  bullets.push(
    `You have ${todayTasks.length} actions today (${todo} todo, ${followup} follow-up, ${reminder} reminder).`,
  );
  if (todayEvents.length > 0) {
    const first = todayEvents[0];
    bullets.push(
      `First scheduled event: ${first?.title || "Untitled event"}${hhmm(first?.time) ? ` at ${hhmm(first?.time)}` : ""}.`,
    );
  } else {
    bullets.push("No calendar events scheduled today.");
  }
  if (timed > 0) {
    bullets.push(`${timed} time-bound task${timed > 1 ? "s" : ""} need strict timing today.`);
  }
  if (todayTasks[0]?.title) {
    bullets.push(`Start with: ${todayTasks[0].title}.`);
  } else if (backlog[0]?.title) {
    bullets.push(`No due-today item found. Start with backlog: ${backlog[0].title}.`);
  } else {
    bullets.push("You are clear right now; keep momentum with one meaningful task.");
  }
  return bullets.slice(0, 4);
}

