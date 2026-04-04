import type { Task } from "@/store/taskStore";

/** Local wall-clock instant for a task's due date + time. */
export function taskDueDateTime(task: Pick<Task, "due_date" | "due_time">): Date {
  const raw = String(task.due_time ?? "09:00").trim();
  const parts = raw.split(":");
  const h = Math.min(23, Math.max(0, Number(parts[0]) || 0));
  const m =
    parts.length >= 2 ? Math.min(59, Math.max(0, Number(parts[1]) || 0)) : 0;
  const [y, mo, d] = task.due_date.split("-").map((x) => Number(x));
  return new Date(y, (mo || 1) - 1, d || 1, h, m, 0, 0);
}

/** Pending tasks whose due date+time is strictly before `now` (any assignee). */
export function isTaskOverdue(
  task: Pick<Task, "status" | "due_date" | "due_time">,
  now: Date = new Date(),
): boolean {
  if (task.status !== "pending") return false;
  return taskDueDateTime(task).getTime() < now.getTime();
}

export function filterOverdueTasks<T extends Pick<Task, "status" | "due_date" | "due_time">>(
  tasks: T[],
  now: Date = new Date(),
): T[] {
  return tasks.filter((t) => isTaskOverdue(t, now));
}

/**
 * Calendar days past the due date (local midnight boundaries). 0 = same calendar day as due.
 * Returns null if the task is not overdue.
 */
export function taskOverdueCalendarDays(
  task: Pick<Task, "status" | "due_date" | "due_time">,
  now: Date = new Date(),
): number | null {
  if (!isTaskOverdue(task, now)) return null;
  const due = taskDueDateTime(task);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((nowDay.getTime() - dueDay.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

/** Full badge / label text, e.g. "Overdue · 3 days" or "Overdue · Today". */
export function overdueAgingLabel(
  task: Pick<Task, "status" | "due_date" | "due_time">,
  now: Date = new Date(),
): string | null {
  const days = taskOverdueCalendarDays(task, now);
  if (days === null) return null;
  if (days === 0) return "Overdue · Today";
  if (days === 1) return "Overdue · 1 day";
  return `Overdue · ${days} days`;
}

/** Short suffix for tight rows, e.g. "Today" or "3d". */
export function overdueAgingShort(
  task: Pick<Task, "status" | "due_date" | "due_time">,
  now: Date = new Date(),
): string | null {
  const days = taskOverdueCalendarDays(task, now);
  if (days === null) return null;
  if (days === 0) return "Today";
  return `${days}d`;
}
