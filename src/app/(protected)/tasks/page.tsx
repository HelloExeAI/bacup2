"use client";

import * as React from "react";
import { useTaskStore } from "@/store/taskStore";
import { formatTaskActorHint } from "@/lib/tasks/actorLabels";
import { isTaskOverdue, overdueAgingLabel } from "@/lib/tasks/taskOverdue";

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
          {tasks.map((t) => {
            const overdue = t.status === "pending" && isTaskOverdue(t);
            const agingLabel = overdue ? overdueAgingLabel(t) : null;
            const actorHint = formatTaskActorHint(t);
            return (
            <div
              key={t.id}
              className={[
                "rounded-lg border p-4",
                overdue
                  ? "border-orange-500/55 bg-orange-500/[0.08] ring-1 ring-orange-500/25 dark:bg-orange-500/[0.12]"
                  : "border-border bg-background",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className={[
                        "truncate text-sm font-semibold",
                        overdue ? "text-orange-950 dark:text-orange-50" : "",
                      ].join(" ")}
                    >
                      {agingLabel ? (
                        <span className="mr-2 inline-flex max-w-[min(100%,14rem)] truncate rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white" title={agingLabel}>
                          {agingLabel}
                        </span>
                      ) : null}
                      {t.title}
                    </div>
                    <Badge type={t.type} />
                  </div>
                  {t.description ? (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {t.description}
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs text-muted-foreground">
                    Assigned to{" "}
                    <span className="font-medium text-foreground">{t.assigned_to || "self"}</span>
                  </div>
                  {actorHint ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">{actorHint}</div>
                  ) : null}
                </div>
                <div
                  className={[
                    "shrink-0 text-xs tabular-nums",
                    overdue ? "font-semibold text-orange-700 dark:text-orange-300" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {`Due ${t.due_date} ${String(t.due_time).slice(0, 5)}`}
                  {t.status === "done" && t.completed_at ? (
                    <div>{`Completed ${String(t.completed_at).slice(0, 16).replace("T", " ")}`}</div>
                  ) : null}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

