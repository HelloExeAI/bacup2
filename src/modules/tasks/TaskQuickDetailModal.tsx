"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { Task } from "@/store/taskStore";
import { scratchpadGmailHref } from "@/lib/tasks/scratchpadGmailHref";
import { formatUpdatedByLine } from "@/lib/tasks/actorLabels";
import { TaskFollowAutomationInline } from "@/modules/tasks/TaskFollowAutomationInline";
import { isTaskOverdue, overdueAgingLabel } from "@/lib/tasks/taskOverdue";

function typeLabel(type: string) {
  if (type === "followup") return "Follow-up";
  if (type === "reminder") return "Reminder";
  return "Todo";
}

const iconBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/80 text-foreground shadow-[0_1px_4px_rgba(61,45,33,0.1)] transition-[transform,background-color,opacity] hover:bg-foreground/5 active:scale-95 disabled:pointer-events-none disabled:opacity-45 dark:shadow-[0_2px_10px_rgba(0,0,0,0.28)]";

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Pending: hollow circle. Done: filled check (toggle = mark incomplete). */
function IconCompleteToggle({ done }: { done: boolean }) {
  if (done) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" fill="currentColor" className="text-emerald-500/90" />
        <path
          d="M8 12l2.5 2.5L16 9"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" className="text-muted-foreground" />
    </svg>
  );
}

export function TaskQuickDetailModal({
  task,
  onClose,
  onEdit,
  onDelete,
  onToggleComplete,
  saving,
  zClass = "z-[60]",
}: {
  task: Task | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleComplete: () => void;
  saving: boolean;
  /** Stacking above parent overlays (e.g. watch list z-50). */
  zClass?: string;
}) {
  useEffect(() => {
    if (!task) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", fn, true);
    return () => document.removeEventListener("keydown", fn, true);
  }, [onClose, task]);

  if (!task) return null;

  const overdue = task.status === "pending" && isTaskOverdue(task);
  const agingLabel = overdue ? overdueAgingLabel(task) : null;
  const done = task.status === "done";

  return (
    <div className={`fixed inset-0 ${zClass}`}>
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/55 dark:bg-black/65"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-quick-detail-title"
        className="absolute left-1/2 top-1/2 w-[min(420px,calc(100vw-28px))] max-h-[min(85vh,calc(100vh-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-[0_12px_40px_rgba(61,45,33,0.2)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {agingLabel ? (
              <span className="mb-1 inline-flex max-w-full truncate rounded-md bg-orange-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-orange-600">
                {agingLabel}
              </span>
            ) : null}
            <h2
              id="task-quick-detail-title"
              className={[
                "text-sm font-semibold leading-snug",
                done ? "text-muted-foreground line-through" : "text-foreground",
              ].join(" ")}
            >
              {task.title}
            </h2>
            {task.recurrence_label ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Recurring · {task.recurrence_label} (one upcoming instance in your list)
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={iconBtn}
            aria-label="Close"
            title="Close"
          >
            <IconClose />
          </button>
        </div>

        {task.description?.trim() ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p>
        ) : (
          <p className="mt-3 text-sm italic text-muted-foreground">No description</p>
        )}

        <dl className="mt-4 grid gap-2 border-t border-border/60 pt-3 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Type</dt>
            <dd className="font-medium text-foreground">{typeLabel(task.type)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Assigned</dt>
            <dd className="font-medium text-foreground">{task.assigned_to || "self"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Due</dt>
            <dd
              className={[
                "font-medium tabular-nums",
                overdue ? "text-orange-700 dark:text-orange-300" : "text-foreground",
              ].join(" ")}
            >
              {task.due_date} {String(task.due_time).slice(0, 5)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium text-foreground">{done ? "Done" : "Pending"}</dd>
          </div>
          {!done && formatUpdatedByLine(task) ? (
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">Updated by</dt>
              <dd className="min-w-0 flex-1 break-words text-right font-medium text-foreground">
                {task.last_edited_by_name?.trim()}
              </dd>
            </div>
          ) : null}
          {task.completed_at ? (
            <div className="flex justify-between gap-2 sm:col-span-2">
              <dt className="text-muted-foreground">Completed</dt>
              <dd className="text-right font-medium text-foreground">
                {String(task.completed_at).slice(0, 16).replace("T", " ")}
                {task.completed_by_name?.trim() ? (
                  <span className="text-muted-foreground"> · {task.completed_by_name.trim()}</span>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>

        {scratchpadGmailHref(task) ? (
          <div className="mt-3">
            <Link
              href={scratchpadGmailHref(task)!}
              className="inline-flex h-8 items-center rounded-full border border-border/80 bg-muted/50 px-3 text-xs font-medium text-foreground shadow-sm hover:bg-foreground/5"
            >
              Open mail
            </Link>
          </div>
        ) : null}

        {!done ? <TaskFollowAutomationInline task={task} disabled={saving} /> : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-1.5 border-t border-border/60 pt-3">
          <button
            type="button"
            disabled={saving || (Boolean(task.series_id) && done)}
            onClick={onToggleComplete}
            className={iconBtn}
            aria-label={done ? "Mark as incomplete" : "Mark as complete"}
            title={
              task.series_id && done
                ? "Completed recurring tasks cannot be reopened"
                : done
                  ? "Mark incomplete"
                  : "Mark complete"
            }
          >
            <IconCompleteToggle done={done} />
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onEdit}
            className={iconBtn}
            aria-label="Edit task"
            title="Edit"
          >
            <IconPencil />
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onDelete}
            className={iconBtn}
            aria-label="Delete task"
            title="Delete"
          >
            <IconTrash />
          </button>
        </div>
      </div>
    </div>
  );
}
