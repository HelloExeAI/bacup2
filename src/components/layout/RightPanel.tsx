"use client";

import { useTaskStore } from "@/store/taskStore";

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
                  <div className="truncate text-sm font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.due_date ? `Due ${t.due_date}` : "No due date"}
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

