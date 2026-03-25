"use client";

import { useMemo } from "react";
import { useTaskStore } from "@/store/taskStore";

function ymdToday() {
  const d = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function badgeLabel(type?: string) {
  if (type === "followup") return "Follow-up";
  if (type === "reminder") return "Reminder";
  return "Todo";
}

export function TodayFocus() {
  const tasks = useTaskStore((s) => s.tasks);
  const today = ymdToday();

  const focus = useMemo(() => {
    const pendingToday = tasks.filter(
      (t: any) => t.status === "pending" && t.due_date === today,
    );
    return pendingToday.sort((a: any, b: any) => {
      const at = a.due_time ?? "";
      const bt = b.due_time ?? "";
      if (at && bt) return at.localeCompare(bt);
      if (at) return -1;
      if (bt) return 1;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [tasks, today]);

  if (focus.length === 0) {
    return <div className="mt-2 text-sm text-muted-foreground">No tasks due today.</div>;
  }

  return (
    <div className="mt-2 space-y-2">
      {focus.slice(0, 6).map((t: any) => (
        <div key={t.id} className="rounded-md border border-border p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-medium">{t.title}</div>
            <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {badgeLabel(t.type)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            @{t.assigned_to ?? "self"}
            {t.due_time ? ` · ${String(t.due_time).slice(0, 5)}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

