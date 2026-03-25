"use client";

import { useTaskStore } from "@/store/taskStore";

function badgeLabel(type?: string) {
  if (type === "followup") return "Follow-up";
  if (type === "reminder") return "Reminder";
  return "Todo";
}

export function RightPanel() {
  const tasks = useTaskStore((s) => s.tasks);
  const focus = tasks.filter((t) => t.status === "pending").slice(0, 5);

  return (
    <aside className="hidden w-80 shrink-0 border-l border-border bg-background xl:block">
      <div className="space-y-4 p-4">
        <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
          <div className="text-sm font-semibold">Today&apos;s Focus</div>
          {focus.length === 0 ? (
            <div className="mt-2 text-sm text-muted-foreground">No tasks yet.</div>
          ) : (
            <div className="mt-2 space-y-2">
              {focus.map((t) => (
                <div key={t.id} className="rounded-md border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {badgeLabel((t as any).type)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(t as any).assigned_to ? `@${(t as any).assigned_to} · ` : ""}
                    {t.due_date
                      ? `Due ${t.due_date}${(t as any).due_time ? ` ${(t as any).due_time}` : ""}`
                      : "No due date"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
          <div className="text-sm font-semibold">SAM Suggestions</div>
          <div className="mt-1 text-sm text-muted-foreground">Placeholder</div>
        </section>
      </div>
    </aside>
  );
}

