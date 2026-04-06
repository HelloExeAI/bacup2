"use client";

import * as React from "react";

import { detectScheduleConflicts, type ScheduleConflict } from "@/lib/scheduling/detectScheduleConflicts";
import type { TimelineItem } from "@/lib/timeline/types";
import type { Event } from "@/store/eventStore";
import type { Task } from "@/store/taskStore";
import { useTaskStore } from "@/store/taskStore";

type Props = {
  open: boolean;
  onClose: () => void;
  todayYmd: string;
  tasks: Task[];
  localEvents: Event[];
  /** From `/api/timeline/today`; null while loading. */
  timelineItems: TimelineItem[] | null;
  timelineLoading: boolean;
  /** Refresh timeline after a successful reschedule (updates conflict list). */
  onRescheduled?: () => void;
};

export function ScheduleConflictModal({
  open,
  onClose,
  todayYmd,
  tasks,
  localEvents,
  timelineItems,
  timelineLoading,
  onRescheduled,
}: Props) {
  const setTasks = useTaskStore((s) => s.setTasks);

  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const conflicts: ScheduleConflict[] = React.useMemo(
    () => detectScheduleConflicts(todayYmd, tasks, localEvents, timelineLoading ? null : timelineItems),
    [todayYmd, tasks, localEvents, timelineItems, timelineLoading],
  );

  const applyTaskPatch = (updated: Task) => {
    const prev = useTaskStore.getState().tasks;
    setTasks(prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
  };

  const reschedule = async (taskId: string) => {
    setSavingId(taskId);
    setError(null);
    try {
      const r1 = await fetch("/api/scheduling/suggest-next-slot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ excludeTaskId: taskId, day: todayYmd }),
      });
      const j1 = (await r1.json().catch(() => null)) as { due_time?: string; error?: string } | null;
      if (!r1.ok) throw new Error(j1?.error || "Could not find a free slot");

      const due_time = j1?.due_time;
      if (!due_time || !/^\d{2}:\d{2}$/.test(due_time)) throw new Error("Invalid slot");

      const r2 = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ due_time }),
      });
      const j2 = (await r2.json().catch(() => null)) as { task?: Task; error?: string } | null;
      if (!r2.ok) throw new Error(j2?.error || "Could not update task");
      if (j2?.task) applyTaskPatch(j2.task);
      onRescheduled?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSavingId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-conflict-title"
        className="relative z-10 w-full max-w-lg rounded-xl border border-border/60 bg-background p-4 shadow-[0_12px_48px_rgba(0,0,0,0.2)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="schedule-conflict-title" className="text-sm font-semibold text-foreground">
            Schedule conflicts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-muted px-3 py-1 text-xs text-foreground hover:bg-foreground/10"
          >
            Close
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Your task due time matches another commitment. Reschedule the task to the next free 15-minute slot — no need to
          open Google or Outlook.
        </p>

        {error ? (
          <div className="mt-2 rounded-md border border-red-500/35 bg-red-500/[0.08] px-2 py-1.5 text-[11px] text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-3 max-h-[min(60vh,420px)] space-y-3 overflow-y-auto">
          {timelineLoading ? (
            <p className="text-xs text-muted-foreground">Analysing…</p>
          ) : conflicts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No conflicts right now.</p>
          ) : (
            conflicts.map(({ task, reasons }) => (
              <div
                key={task.id}
                className="rounded-lg border border-border/50 bg-muted/40 p-3 dark:bg-muted/20"
              >
                <div className="text-sm font-medium text-foreground">{task.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Due {task.due_date} {String(task.due_time).slice(0, 5)}
                </div>
                <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  {reasons.map((r, i) => (
                    <li key={`${task.id}-${i}`}>
                      <span className="text-foreground/90">{r.sourceLabel}</span>: {r.title}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={savingId === task.id}
                  onClick={() => void reschedule(task.id)}
                  className="mt-3 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
                >
                  {savingId === task.id ? "Rescheduling…" : "Reschedule to next free slot"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
