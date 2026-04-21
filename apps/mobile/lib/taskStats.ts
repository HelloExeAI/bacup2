/** Minimal task shape for KPI math (aligned with web `Task`). */
export type TaskLike = {
  status: string;
  due_date: string;
  due_time?: string | null;
  type?: string;
};

export function taskDueDateTime(task: Pick<TaskLike, "due_date" | "due_time">): Date {
  const raw = String(task.due_time ?? "09:00").trim();
  const parts = raw.split(":");
  const h = Math.min(23, Math.max(0, Number(parts[0]) || 0));
  const m = parts.length >= 2 ? Math.min(59, Math.max(0, Number(parts[1]) || 0)) : 0;
  const [y, mo, d] = task.due_date.split("-").map((x) => Number(x));
  return new Date(y, (mo || 1) - 1, d || 1, h, m, 0, 0);
}

export function isTaskOverdue(task: Pick<TaskLike, "status" | "due_date" | "due_time">, now = new Date()): boolean {
  if (task.status !== "pending") return false;
  return taskDueDateTime(task).getTime() < now.getTime();
}

export function ymdToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function briefTaskStats(tasks: TaskLike[]) {
  const today = ymdToday();
  const now = new Date();
  const pending = tasks.filter((t) => t.status === "pending");
  return {
    overdue: pending.filter((t) => isTaskOverdue(t, now)).length,
    todaysLoad: pending.filter((t) => t.due_date === today).length,
    waitingFollowups: pending.filter((t) => t.type === "followup").length,
    activePriorities: pending.filter((t) => t.type === "todo").length,
    pendingTotal: pending.length,
  };
}
