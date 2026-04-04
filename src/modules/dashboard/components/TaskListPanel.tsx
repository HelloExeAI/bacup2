"use client";

import Link from "next/link";
import type { Task } from "@/store/taskStore";
import { scratchpadGmailHref } from "@/lib/tasks/scratchpadGmailHref";
import { formatTaskActorHint } from "@/lib/tasks/actorLabels";
import { isTaskOverdue, overdueAgingLabel } from "@/lib/tasks/taskOverdue";

function taskTypeLabel(type: string) {
  if (type === "followup") return "Follow-up";
  if (type === "reminder") return "Reminder";
  return "Todo";
}

type SortKey = "due" | "type" | "status";
type SortDir = "asc" | "desc";

function SortTriangle({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span
      className={[
        "ml-1 inline-block text-[10px] leading-none transition-opacity",
        active ? "opacity-100 text-foreground" : "opacity-35 text-muted-foreground",
      ].join(" ")}
      aria-hidden
    >
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

export function TaskListPanel({
  tasks,
  onTaskSelect,
  sortState,
  onSort,
}: {
  tasks: Task[];
  onTaskSelect?: (t: Task) => void;
  sortState: Record<SortKey, SortDir | null>;
  onSort: (key: SortKey) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-background p-6 text-sm text-muted-foreground shadow-sm">
        No tasks for this view.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm">
      <div className="grid grid-cols-12 gap-2 border-b border-border bg-muted/25 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <div className="col-span-5">Task</div>
        <div className="col-span-2">Assigned To</div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSort("due");
          }}
          className="col-span-2 flex items-center text-left hover:text-foreground"
        >
          Due
          <SortTriangle active={!!sortState.due} dir={sortState.due ?? "asc"} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSort("type");
          }}
          className="col-span-1 flex items-center text-left hover:text-foreground"
        >
          Type
          <SortTriangle active={!!sortState.type} dir={sortState.type ?? "asc"} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSort("status");
          }}
          className="col-span-2 flex items-center text-left hover:text-foreground"
        >
          Status
          <SortTriangle active={!!sortState.status} dir={sortState.status ?? "asc"} />
        </button>
      </div>
      <div className="max-h-[52vh] overflow-y-auto">
        {tasks.map((t) => {
          const overdue = t.status === "pending" && isTaskOverdue(t);
          const agingLabel = overdue ? overdueAgingLabel(t) : null;
          const actorHint = formatTaskActorHint(t);
          const mailHref = scratchpadGmailHref(t);
          return (
          <div
            key={t.id}
            role={onTaskSelect ? "button" : undefined}
            tabIndex={onTaskSelect ? 0 : undefined}
            title={actorHint || undefined}
            onClick={() => onTaskSelect?.(t)}
            onKeyDown={(e) => {
              if (!onTaskSelect) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTaskSelect(t);
              }
            }}
            className={[
              "grid grid-cols-12 gap-2 border-b border-border/60 px-3 py-2 text-xs last:border-b-0",
              onTaskSelect ? "cursor-pointer hover:bg-muted/45" : "",
              overdue
                ? "border-l-[3px] border-l-orange-500 bg-orange-50/95 dark:border-l-orange-400 dark:bg-orange-500/[0.12]"
                : "",
            ].join(" ")}
          >
            <div
              className={`col-span-5 min-w-0 truncate ${t.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}
            >
              {agingLabel ? (
                <span className="mr-1.5 inline-flex max-w-[min(100%,11rem)] items-center truncate rounded-sm bg-orange-500 px-1 py-px text-[9px] font-semibold tracking-wide text-white" title={agingLabel}>
                  {agingLabel}
                </span>
              ) : null}
              <span className="align-middle">{t.title}</span>
              {t.recurrence_label ? (
                <span
                  className="ml-1.5 inline-flex max-w-[min(100%,9rem)] align-middle truncate rounded border border-border/70 bg-muted/40 px-1 py-px text-[9px] font-medium text-muted-foreground"
                  title={`Recurring · ${t.recurrence_label}`}
                >
                  {t.recurrence_label}
                </span>
              ) : null}
              {mailHref ? (
                <Link
                  href={mailHref}
                  className="ml-1.5 inline-flex align-middle rounded border border-border/70 bg-muted/30 px-1.5 py-px text-[9px] font-medium text-foreground/90 hover:bg-foreground/5"
                  title="Open mail"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  Mail
                </Link>
              ) : null}
            </div>
            <div className="col-span-2 truncate text-muted-foreground">{t.assigned_to}</div>
            <div
              className={`col-span-2 truncate tabular-nums ${overdue ? "font-semibold text-orange-800 dark:text-orange-200" : "text-muted-foreground"}`}
            >
              {t.due_date} {String(t.due_time).slice(0, 5)}
            </div>
            <div className="col-span-1 text-muted-foreground">{taskTypeLabel(t.type)}</div>
            <div className="col-span-2 text-muted-foreground">
              {t.status === "done"
                ? `Done${t.completed_at ? ` · ${String(t.completed_at).slice(0, 16).replace("T", " ")}` : ""}`
                : "Pending"}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

