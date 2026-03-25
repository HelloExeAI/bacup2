 "use client";

import * as React from "react";
import { useTaskStore } from "@/store/taskStore";

export default function TasksPage() {
  const tasks = useTaskStore((s) => s.tasks);

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Tasks</h1>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{t.title}</div>
                  {t.description ? (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {t.description}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {t.due_date ? `Due ${t.due_date}` : "No due date"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

