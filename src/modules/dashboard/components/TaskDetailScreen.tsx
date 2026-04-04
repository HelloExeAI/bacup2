"use client";

import Link from "next/link";
import { TaskDescriptionAiField } from "@/modules/tasks/TaskDescriptionAiField";
import { scratchpadGmailHref } from "@/lib/tasks/scratchpadGmailHref";
import type { Task } from "@/store/taskStore";
import { isTaskOverdue, overdueAgingLabel } from "@/lib/tasks/taskOverdue";

function taskTypeLabel(type: string) {
  if (type === "followup") return "Follow-up";
  if (type === "reminder") return "Reminder";
  return "Todo";
}

const recurringDoneLocked =
  "Completed recurring tasks cannot be marked incomplete. Pause the series instead if you need to stop.";

export function TaskDetailScreen({
  task,
  onBack,
  saving,
  editing,
  editingTitle,
  onChangeEditingTitle,
  editingDescription,
  onChangeEditingDescription,
  onToggleComplete,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onPauseSeries,
}: {
  task: Task;
  onBack: () => void;
  saving: boolean;
  editing: boolean;
  editingTitle: string;
  onChangeEditingTitle: (v: string) => void;
  editingDescription: string;
  onChangeEditingDescription: (v: string) => void;
  onToggleComplete: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  /** Pause the recurrence series (stops future instances). */
  onPauseSeries?: () => void;
}) {
  const overdue = task.status === "pending" && isTaskOverdue(task);
  const agingLabel = overdue ? overdueAgingLabel(task) : null;
  const mailHref = scratchpadGmailHref(task);

  return (
    <div
      className={[
        "rounded-xl p-4 shadow-[0_10px_24px_rgba(0,0,0,0.08)]",
        overdue
          ? "border border-orange-500/45 bg-orange-500/[0.08] dark:bg-orange-500/[0.12]"
          : "bg-muted/45",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
        >
          ← Back to queue
        </button>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {agingLabel ? (
            <span className="max-w-[min(100%,14rem)] truncate rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white dark:bg-orange-600" title={agingLabel}>
              {agingLabel}
            </span>
          ) : null}
          <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {taskTypeLabel(task.type)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={editingTitle}
              onChange={(e) => onChangeEditingTitle(e.target.value)}
              className="h-8 w-full rounded-md bg-muted/60 px-2 text-sm font-semibold text-foreground focus-visible:outline-none"
              autoFocus
            />
          ) : (
            <h2
              className={[
                "truncate text-base font-semibold",
                task.status === "done" ? "text-muted-foreground line-through" : "text-foreground",
              ].join(" ")}
            >
              {task.title}
            </h2>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {mailHref ? (
            <Link
              href={mailHref}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-muted/60"
            >
              Open mail
            </Link>
          ) : null}
          {task.series_id && onPauseSeries ? (
            <button
              type="button"
              onClick={onPauseSeries}
              disabled={saving}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm hover:bg-muted/60 disabled:opacity-50"
            >
              Pause series
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleComplete}
            disabled={saving || (Boolean(task.series_id) && task.status === "done")}
            title={
              Boolean(task.series_id) && task.status === "done" ? recurringDoneLocked : undefined
            }
            className="rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-foreground/5 disabled:opacity-50"
          >
            {task.status === "done" ? "Mark incomplete" : "Mark complete"}
          </button>
          {editing ? (
            <>
              <button
                type="button"
                onClick={onSaveEdit}
                disabled={saving}
                className="rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-foreground/5 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm hover:bg-foreground/5"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStartEdit}
              className="rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-foreground/5"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-foreground/5 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3">
          <TaskDescriptionAiField
            value={editingDescription}
            onChange={onChangeEditingDescription}
            title={editingTitle}
            dueDate={task.due_date}
            dueTime={String(task.due_time).slice(0, 5)}
            assignedTo={task.assigned_to}
            taskType={task.type}
            disabled={saving}
          />
        </div>
      ) : task.description ? (
        <p className="mt-2 text-sm text-muted-foreground">{task.description}</p>
      ) : null}

      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Assigned to</dt>
          <dd className="font-medium text-foreground">{task.assigned_to}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Due</dt>
          <dd
            className={[
              "font-medium",
              overdue ? "text-orange-700 dark:text-orange-300" : "text-foreground",
            ].join(" ")}
          >
            {task.due_date} {String(task.due_time).slice(0, 5)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-medium text-foreground">{task.status === "done" ? "Done" : "Pending"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="font-medium text-foreground">{task.source}</dd>
        </div>
        {task.recurrence_label ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Recurrence</dt>
            <dd className="font-medium text-foreground">
              {task.recurrence_label}
              <span className="ml-1.5 text-muted-foreground">
                (only the next occurrence is shown in your list)
              </span>
            </dd>
          </div>
        ) : null}
        {task.completed_at ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Completed</dt>
            <dd className="font-medium text-foreground">
              {String(task.completed_at).slice(0, 16).replace("T", " ")}
              {task.completed_by_name?.trim() ? (
                <span className="text-muted-foreground"> · {task.completed_by_name.trim()}</span>
              ) : null}
            </dd>
          </div>
        ) : null}
        {task.last_edited_by_name?.trim() ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Updated by</dt>
            <dd className="break-words font-medium text-foreground">{task.last_edited_by_name.trim()}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
