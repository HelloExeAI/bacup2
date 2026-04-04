import { isTaskOverdue, taskOverdueCalendarDays } from "@/lib/tasks/taskOverdue";
import type { Task } from "@/store/taskStore";

export class StrategyEngine {
  private todayYmd(now = new Date()) {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  private tomorrowYmd(now = new Date()) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return this.todayYmd(d);
  }

  private compareDate(a: string | null, b: string | null) {
    return (a ?? "").localeCompare(b ?? "");
  }

  private compareTime(a: string | null, b: string | null) {
    const at = (a ?? "").slice(0, 5);
    const bt = (b ?? "").slice(0, 5);
    return at.localeCompare(bt);
  }

  private pickPriority(overdue: Task[], dueToday: Task[]) {
    if (overdue.length > 0) return overdue[0]!;

    const withTime = dueToday
      .filter((t: any) => !!t.due_time)
      .sort((a: any, b: any) => this.compareTime(a.due_time, b.due_time));
    if (withTime.length > 0) return withTime[0]!;

    return dueToday[0] ?? null;
  }

  generateSuggestions(tasks: Task[]): string[] {
    const now = new Date();
    const today = this.todayYmd(now);
    const tomorrow = this.tomorrowYmd(now);

    const pending = tasks.filter((t) => t.status === "pending");

    const overdue = pending
      .filter((t) => isTaskOverdue(t, now))
      .sort((a, b) => {
        const da = taskOverdueCalendarDays(a, now) ?? 0;
        const db = taskOverdueCalendarDays(b, now) ?? 0;
        if (db !== da) return db - da;
        return this.compareDate(a.due_date, b.due_date);
      });

    const dueToday = pending
      .filter((t) => t.due_date === today)
      .sort((a: any, b: any) => {
        if (a.due_time && b.due_time) return this.compareTime(a.due_time, b.due_time);
        if (a.due_time) return -1;
        if (b.due_time) return 1;
        return (a.created_at ?? "").localeCompare(b.created_at ?? "");
      });

    const dueTomorrow = pending
      .filter((t) => t.due_date === tomorrow)
      .sort((a: any, b: any) => {
        if (a.due_time && b.due_time) return this.compareTime(a.due_time, b.due_time);
        if (a.due_time) return -1;
        if (b.due_time) return 1;
        return (a.created_at ?? "").localeCompare(b.created_at ?? "");
      });

    if (pending.length === 0) return ["You’re all clear. Plan ahead."];

    const suggestions: string[] = [];

    if (overdue.length > 0) {
      const oldestDays = taskOverdueCalendarDays(overdue[0]!, now) ?? 0;
      const aging =
        oldestDays === 0
          ? "oldest due today"
          : oldestDays === 1
            ? "oldest 1 day overdue"
            : `oldest ${oldestDays} days overdue`;
      suggestions.push(
        `You have ${overdue.length} overdue tasks (${aging}). Start with ${overdue[0]!.title}`,
      );
    }

    if (dueToday.length > 0) {
      suggestions.push(`You have ${dueToday.length} tasks due today`);
    }

    if (dueTomorrow.length > 0) {
      suggestions.push(`Prepare for tomorrow: ${dueTomorrow[0]!.title}`);
    }

    const priority = this.pickPriority(overdue, dueToday);
    if (priority) suggestions.push(`Start with: ${priority.title}`);

    return suggestions;
  }
}

