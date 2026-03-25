 "use client";

import * as React from "react";
import { useTaskStore } from "@/store/taskStore";

function Badge({ type }: { type: string }) {
  const label =
    type === "followup" ? "Follow-up" : type === "reminder" ? "Reminder" : "Todo";
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  );
}

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
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold">{t.title}</div>
                    <Badge type={(t as any).type} />
                  </div>
                  {t.description ? (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {t.description}
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs text-muted-foreground">
                    Assigned to <span className="font-medium text-foreground">{(t as any).assigned_to ?? "self"}</span>
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {t.due_date
                    ? `Due ${t.due_date}${(t as any).due_time ? ` ${(t as any).due_time}` : ""}`
                    : "No due date"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

