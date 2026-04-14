"use client";

import * as React from "react";
import type { Task } from "@/store/taskStore";
import { formatUpdatedByLine } from "@/lib/tasks/actorLabels";
import { isTaskOverdue, overdueAgingLabel } from "@/lib/tasks/taskOverdue";

function typeLabel(type: string) {
  if (type === "followup") return "Follow-up";
  if (type === "reminder") return "Reminder";
  return "Todo";
}

/** Match `WatchList` task row surfaces (soft tint, depth via shadow — no heavy solid orange blocks). */
const kpiTaskCardSurface = (overdue: boolean) =>
  [
    "rounded-xl p-2.5",
    overdue
      ? "bg-orange-500/[0.11] shadow-[0_1px_0_rgba(180,90,30,0.07),0_8px_20px_rgba(180,90,30,0.14)] dark:bg-orange-500/[0.16] dark:shadow-[0_8px_24px_rgba(0,0,0,0.38)]"
      : "bg-muted/50 shadow-[0_1px_0_rgba(70,54,39,0.05),0_6px_18px_rgba(61,45,33,0.1)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.32)]",
  ].join(" ");

const kpiRowIconBtn =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted/70 text-foreground shadow-[0_1px_3px_rgba(61,45,33,0.08)] transition-[transform,background-color,opacity] hover:bg-foreground/5 active:scale-95 disabled:pointer-events-none disabled:opacity-45 dark:shadow-[0_1px_6px_rgba(0,0,0,0.22)]";

function IconPencil() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
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
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
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

export function KpiActionModal({
  open,
  title,
  subtitle,
  tasks,
  onClose,
  onSelectTask,
  savingId,
  editingId,
  editingTitle,
  onChangeEditingTitle,
  editingDescription: _editingDescription,
  onChangeEditingDescription: _onChangeEditingDescription,
  onToggleComplete,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  open: boolean;
  title: string;
  /** e.g. cockpit view label with department */
  subtitle?: string | null;
  tasks: Task[];
  onClose: () => void;
  onSelectTask: (t: Task) => void;
  savingId: string | null;
  editingId: string | null;
  editingTitle: string;
  onChangeEditingTitle: (v: string) => void;
  /** Carried for shared save state with dashboard; KPI rows only edit title inline. */
  editingDescription?: string;
  onChangeEditingDescription?: (v: string) => void;
  onToggleComplete: (t: Task) => void;
  onStartEdit: (t: Task) => void;
  onCancelEdit: () => void;
  onSaveEdit: (t: Task) => void;
  onDelete: (id: string) => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/55 dark:bg-black/65"
        onClick={onClose}
      />
      <div className="absolute left-1/2 top-16 w-[min(760px,calc(100vw-24px))] -translate-x-1/2 rounded-xl border border-border bg-background shadow-[0_12px_40px_rgba(61,45,33,0.2)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{title}</div>
            {subtitle ? (
              <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
            ) : null}
            <div className="text-[11px] text-muted-foreground">{tasks.length} items</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-foreground/5"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-3">
          {tasks.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
              Nothing in this category.
            </div>
          ) : (
            <div className="space-y-1.5">
              {tasks.map((t) => {
                const isEditing = editingId === t.id;
                const isSaving = savingId === t.id;
                const overdue = t.status === "pending" && isTaskOverdue(t);
                const agingLabel = overdue ? overdueAgingLabel(t) : null;

                const metaPrimary = (
                  <div
                    className={[
                      "mt-0.5 text-[10px] tabular-nums text-muted-foreground",
                      overdue ? "font-medium" : "",
                    ].join(" ")}
                  >
                    {t.assigned_to} · {t.due_date} {String(t.due_time).slice(0, 5)} ·{" "}
                    {t.status === "done"
                      ? `Done${t.completed_at ? ` · ${String(t.completed_at).slice(0, 16).replace("T", " ")}` : ""}${t.completed_by_name?.trim() ? ` · ${t.completed_by_name.trim()}` : ""}`
                      : "Pending"}
                  </div>
                );
                const metaUpdated =
                  t.status === "pending" && formatUpdatedByLine(t) ? (
                    <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground break-words whitespace-normal">
                      {formatUpdatedByLine(t)}
                    </div>
                  ) : null;

                return (
                  <div key={t.id} className={kpiTaskCardSurface(overdue)}>
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleComplete(t)}
                          disabled={isSaving}
                          aria-label={t.status === "done" ? "Mark as incomplete" : "Mark as complete"}
                          className={[
                            "mt-0.5 h-4 w-4 shrink-0 self-start rounded-full transition-colors disabled:opacity-50",
                            t.status === "done" ? "bg-emerald-500/80" : "bg-muted/80 hover:bg-foreground/10",
                          ].join(" ")}
                          title={t.status === "done" ? "Mark as incomplete" : "Mark as complete"}
                        />
                        <div className="min-w-0 flex-1">
                          <input
                            value={editingTitle}
                            onChange={(e) => onChangeEditingTitle(e.target.value)}
                            className="h-8 w-full rounded-md bg-muted/80 px-2 text-sm font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            autoFocus
                          />
                          {metaPrimary}
                          {metaUpdated}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSaveEdit(t)}
                              disabled={isSaving}
                              className="rounded-full bg-foreground px-3 py-1 text-[10px] font-semibold text-background shadow-sm hover:opacity-90 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={onCancelEdit}
                              disabled={isSaving}
                              className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-foreground shadow-sm hover:bg-foreground/5 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted/90 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-[0_1px_3px_rgba(61,45,33,0.08)] dark:bg-muted dark:shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
                          {typeLabel(t.type)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleComplete(t)}
                          disabled={isSaving}
                          aria-label={t.status === "done" ? "Mark as incomplete" : "Mark as complete"}
                          className={[
                            "mt-0.5 h-4 w-4 shrink-0 self-start rounded-full transition-colors disabled:opacity-50",
                            t.status === "done" ? "bg-emerald-500/80" : "bg-muted/80 hover:bg-foreground/10",
                          ].join(" ")}
                          title={t.status === "done" ? "Mark as incomplete" : "Mark as complete"}
                        />
                        <button
                          type="button"
                          onClick={() => onSelectTask(t)}
                          aria-label={`Task details: ${t.title}`}
                          className="min-w-0 flex-1 rounded-md py-0.5 text-left outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <div
                            className={[
                              "truncate text-xs font-medium",
                              t.status === "done" ? "text-muted-foreground line-through" : "text-foreground",
                            ].join(" ")}
                          >
                            {agingLabel ? (
                              <span
                                className="mr-1 inline-flex max-w-[9rem] truncate rounded-sm bg-orange-500/90 px-1 py-px text-[8px] font-semibold leading-tight text-white"
                                title={agingLabel}
                              >
                                {agingLabel}
                              </span>
                            ) : null}
                            {t.title}
                          </div>
                          {metaPrimary}
                          {metaUpdated}
                        </button>
                        <div className="flex shrink-0 flex-col items-end self-stretch">
                          <span className="rounded-full bg-muted/90 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-[0_1px_3px_rgba(61,45,33,0.08)] dark:bg-muted dark:shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
                            {typeLabel(t.type)}
                          </span>
                          <div className="mt-auto flex gap-0.5 pt-0.5">
                            <button
                              type="button"
                              onClick={() => onStartEdit(t)}
                              className={kpiRowIconBtn}
                              aria-label="Edit task"
                              title="Edit"
                            >
                              <IconPencil />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(t.id)}
                              disabled={isSaving}
                              className={kpiRowIconBtn}
                              aria-label="Delete task"
                              title="Delete"
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
