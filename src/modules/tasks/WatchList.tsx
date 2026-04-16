"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { useTaskStore, type Task, type TaskType } from "@/store/taskStore";
import { formatUpdatedByLine } from "@/lib/tasks/actorLabels";
import { isTaskOverdue, overdueAgingLabel } from "@/lib/tasks/taskOverdue";
import { TaskDescriptionAiField } from "@/modules/tasks/TaskDescriptionAiField";
import { TaskQuickDetailModal } from "@/modules/tasks/TaskQuickDetailModal";
import { scratchpadGmailHref } from "@/lib/tasks/scratchpadGmailHref";

export type WatchTab = "all" | "todo" | "followup" | "reminder";

type WatchEditDraft = {
  title: string;
  description: string;
  due_date: string;
  due_time: string;
  assigned_to: string;
  type: TaskType;
};

function normalizeDueTime(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "09:00";
  const h = Math.min(23, Math.max(0, Number(m[1]) || 0));
  const min = Math.min(59, Math.max(0, Number(m[2]) || 0));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function draftFromTask(t: Task): WatchEditDraft {
  return {
    title: t.title,
    description: t.description ?? "",
    due_date: t.due_date,
    due_time: String(t.due_time ?? "09:00").slice(0, 5),
    assigned_to: (t.assigned_to || "self").trim(),
    type: t.type,
  };
}

const editFormSurface =
  "mt-2 space-y-2 rounded-lg bg-background/90 p-3 shadow-[0_4px_16px_rgba(61,45,33,0.1)] dark:bg-background/50 dark:shadow-[0_4px_18px_rgba(0,0,0,0.35)]";

function badgeLabel(type?: string) {
  if (type === "followup") return "Follow-up";
  if (type === "reminder") return "Reminder";
  return "Todo";
}

const watchRowIconBtn =
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

function IconMail() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22 6l-10 7L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

function filterByTab(tasks: Task[], tab: WatchTab) {
  if (tab === "all") return tasks;
  return tasks.filter((t) => t.type === tab);
}

export function WatchListModal({
  open,
  onClose,
  /** When set (YYYY-MM-DD), only tasks due on that calendar day are listed. */
  dueDateFilter,
  /** Overrides header title (e.g. “Today's tasks” from Today’s Focus). */
  listTitle,
  /** Open on a specific tab (e.g. Follow-ups from Overview KPI). */
  initialTab,
}: {
  open: boolean;
  onClose: () => void;
  dueDateFilter?: string | null;
  listTitle?: string | null;
  initialTab?: WatchTab;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const setTasks = useTaskStore((s) => s.setTasks);
  const removeByIds = useTaskStore((s) => s.removeByIds);
  const [tab, setTab] = useState<WatchTab>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<WatchEditDraft | null>(null);
  const [peekTaskId, setPeekTaskId] = useState<string | null>(null);

  const peekLive = useMemo(() => {
    if (!peekTaskId) return null;
    return tasks.find((t) => t.id === peekTaskId) ?? null;
  }, [peekTaskId, tasks]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft(null);
  }, []);

  useEffect(() => {
    if (open) setTab(initialTab ?? "all");
  }, [open, dueDateFilter, initialTab]);

  useEffect(() => {
    if (!open) cancelEdit();
  }, [open, cancelEdit]);

  useEffect(() => {
    if (!open) setPeekTaskId(null);
  }, [open]);

  useEffect(() => {
    if (peekTaskId && !tasks.some((t) => t.id === peekTaskId)) setPeekTaskId(null);
  }, [peekTaskId, tasks]);

  const taskList = useMemo(() => {
    let list = [...tasks];
    if (dueDateFilter?.trim()) {
      const ymd = dueDateFilter.trim();
      list = list.filter((t) => t.due_date === ymd);
    }
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      const dc = a.due_date.localeCompare(b.due_date);
      if (dc !== 0) return dc;
      const tc = String(a.due_time ?? "").localeCompare(String(b.due_time ?? ""));
      if (tc !== 0) return tc;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [dueDateFilter, tasks]);

  const stats = useMemo(() => {
    const out = { todo: 0, followup: 0, reminder: 0 };
    for (const t of taskList) {
      if (t.type === "followup") out.followup += 1;
      else if (t.type === "reminder") out.reminder += 1;
      else out.todo += 1;
    }
    return out;
  }, [taskList]);

  const filtered = useMemo(() => filterByTab(taskList, tab), [taskList, tab]);

  const updateTaskLocal = (id: string, patch: Partial<Task>) => {
    const next = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
    setTasks(next);
  };

  const toggleTaskStatus = async (t: Task) => {
    if (savingId) return;
    setSavingId(t.id);
    const beforeStatus = t.status;
    const beforeCompletedAt = t.completed_at;
    const nextStatus = t.status === "done" ? "pending" : "done";
    updateTaskLocal(t.id, {
      status: nextStatus,
      completed_at: nextStatus === "done" ? new Date().toISOString() : null,
    });
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      if (j?.task) updateTaskLocal(t.id, j.task);
      posthog.capture(nextStatus === "done" ? "task_completed" : "task_reopened", {
        task_id: t.id,
        task_type: t.type,
        assigned_to: t.assigned_to,
      });
    } catch {
      updateTaskLocal(t.id, { status: beforeStatus, completed_at: beforeCompletedAt });
    } finally {
      setSavingId(null);
    }
  };

  const saveEdit = async (t: Task) => {
    if (!editDraft || savingId) return;
    const title = editDraft.title.trim();
    if (!title) return;
    const due_date = editDraft.due_date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return;
    const due_time = normalizeDueTime(editDraft.due_time);
    const assigned_to = editDraft.assigned_to.trim() || "self";
    const description = editDraft.description.trim() ? editDraft.description.trim() : null;
    const type = editDraft.type;

    setSavingId(t.id);
    const before = { ...t };
    updateTaskLocal(t.id, { title, description, due_date, due_time, assigned_to, type });
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description, due_date, due_time, assigned_to, type }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error((j as { error?: string })?.error || `Failed (${res.status})`);
      if (j?.task) updateTaskLocal(t.id, j.task as Task);
      posthog.capture("task_edited", {
        task_id: t.id,
        task_type: type,
        assigned_to,
      });
      cancelEdit();
    } catch {
      updateTaskLocal(t.id, before);
    } finally {
      setSavingId(null);
    }
  };

  const deleteTask = async (t: Task) => {
    if (savingId) return;
    setSavingId(t.id);
    removeByIds([t.id]);
    try {
      const res = await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      posthog.capture("task_deleted", {
        task_id: t.id,
        task_type: t.type,
        assigned_to: t.assigned_to,
      });
    } catch {
      setTasks([t, ...tasks]);
    } finally {
      setSavingId(null);
      if (editingId === t.id) cancelEdit();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (peekTaskId) setPeekTaskId(null);
        else if (editingId) cancelEdit();
        else onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editingId, onClose, open, peekTaskId]);

  if (!open) return null;

  const headerTitle = (listTitle?.trim() || "Watch List").trim();

  const dueDateLabel = dueDateFilter?.trim()
    ? new Date(`${dueDateFilter.trim()}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const completionLabel = (ts: string | null | undefined) => {
    if (!ts) return "Completed";
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `Completed ${y}-${m}-${day} ${hh}:${mm}`;
  };

  /** Centered modal shell (viewport-centered; avoids drifting with layout reflows). */
  const panelShell =
    "relative z-10 w-full max-w-[760px] overflow-hidden rounded-xl bg-background shadow-[0_1px_0_rgba(70,54,39,0.05),0_12px_40px_rgba(61,45,33,0.14)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close watch list"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className={panelShell}>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{headerTitle}</div>
            {dueDateLabel ? (
              <div className="text-[11px] text-muted-foreground">
                Tasks due {dueDateLabel}
              </div>
            ) : null}
            <div className="text-[11px] text-muted-foreground">
              Todo {stats.todo} · Follow-up {stats.followup} · Reminder {stats.reminder}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs text-foreground shadow-[0_1px_0_rgba(70,54,39,0.06),0_6px_16px_rgba(61,45,33,0.1)] hover:bg-foreground/5 dark:shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
          >
            Close
          </button>
        </div>

        <div className="px-3 pb-3 pt-1">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "All" },
              { id: "todo", label: "Todos" },
              { id: "followup", label: "Follow-ups" },
              { id: "reminder", label: "Reminders" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as WatchTab)}
                className={[
                  "inline-flex h-8 items-center rounded-full px-3 text-[11px] font-semibold transition-[box-shadow,background-color]",
                  tab === t.id
                    ? "bg-ring/20 text-foreground shadow-[0_4px_14px_rgba(61,45,33,0.14)] dark:shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
                    : "bg-muted/90 text-muted-foreground shadow-[0_2px_8px_rgba(61,45,33,0.06)] hover:bg-muted dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)]",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[68vh] overflow-y-auto p-3">
          {taskList.length === 0 ? (
            <div className="rounded-md bg-muted/45 p-3 text-xs text-muted-foreground shadow-[0_10px_24px_rgba(0,0,0,0.08)]">
              {dueDateLabel ? `No tasks due on ${dueDateLabel}.` : "No tasks yet."}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md bg-muted/45 p-3 text-xs text-muted-foreground shadow-[0_10px_24px_rgba(0,0,0,0.08)]">
              No items in this tab.
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((t) => {
                const overdue = t.status === "pending" && isTaskOverdue(t);
                const agingLabel = overdue ? overdueAgingLabel(t) : null;
                return (
                <div
                  key={t.id}
                  className={[
                    "rounded-xl p-2.5",
                    overdue
                      ? "bg-orange-500/[0.11] shadow-[0_1px_0_rgba(180,90,30,0.07),0_8px_20px_rgba(180,90,30,0.14)] dark:bg-orange-500/[0.16] dark:shadow-[0_8px_24px_rgba(0,0,0,0.38)]"
                      : "bg-muted/50 shadow-[0_1px_0_rgba(70,54,39,0.05),0_6px_18px_rgba(61,45,33,0.1)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.32)]",
                  ].join(" ")}
                >
                  {editingId === t.id && editDraft ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleTaskStatus(t)}
                        disabled={savingId === t.id}
                        aria-label={t.status === "done" ? "Mark as incomplete" : "Mark as complete"}
                        className={[
                          "mt-0.5 h-4 w-4 shrink-0 rounded-full transition-colors disabled:opacity-50",
                          t.status === "done"
                            ? "bg-emerald-500/80"
                            : "bg-muted/80 hover:bg-foreground/10",
                        ].join(" ")}
                      />
                      <div className={`min-w-0 flex-1 ${editFormSurface}`}>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Edit task
                        </div>
                        <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Title
                          <input
                            value={editDraft.title}
                            onChange={(e) =>
                              setEditDraft((d) => (d ? { ...d, title: e.target.value } : d))
                            }
                            className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          />
                        </label>
                        <div className="mt-2">
                          <TaskDescriptionAiField
                            value={editDraft.description}
                            onChange={(next) =>
                              setEditDraft((d) => (d ? { ...d, description: next } : d))
                            }
                            title={editDraft.title}
                            dueDate={editDraft.due_date}
                            dueTime={editDraft.due_time}
                            assignedTo={editDraft.assigned_to}
                            taskType={editDraft.type}
                            disabled={savingId === t.id}
                          />
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Due date
                            <input
                              type="date"
                              value={editDraft.due_date}
                              onChange={(e) =>
                                setEditDraft((d) => (d ? { ...d, due_date: e.target.value } : d))
                              }
                              className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            />
                          </label>
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Due time
                            <input
                              type="time"
                              value={editDraft.due_time}
                              onChange={(e) =>
                                setEditDraft((d) => (d ? { ...d, due_time: e.target.value } : d))
                              }
                              className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            />
                          </label>
                        </div>
                        <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Assigned to
                          <input
                            value={editDraft.assigned_to}
                            onChange={(e) =>
                              setEditDraft((d) => (d ? { ...d, assigned_to: e.target.value } : d))
                            }
                            placeholder="self or name"
                            className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          />
                        </label>
                        <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Type
                          <select
                            value={editDraft.type}
                            onChange={(e) =>
                              setEditDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      type: e.target.value as TaskType,
                                    }
                                  : d,
                              )
                            }
                            className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            <option value="todo">Todo</option>
                            <option value="followup">Follow-up</option>
                            <option value="reminder">Reminder</option>
                          </select>
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void saveEdit(t)}
                            disabled={savingId === t.id}
                            className="rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background shadow-md hover:opacity-90 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={savingId === t.id}
                            className="rounded-full bg-muted px-4 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-foreground/5 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleTaskStatus(t)}
                          disabled={savingId === t.id}
                          aria-label={t.status === "done" ? "Mark as incomplete" : "Mark as complete"}
                          className={[
                            "mt-0.5 h-4 w-4 shrink-0 self-start rounded-full transition-colors disabled:opacity-50",
                            t.status === "done"
                              ? "bg-emerald-500/80"
                              : "bg-muted/80 hover:bg-foreground/10",
                          ].join(" ")}
                          title={t.status === "done" ? "Mark as incomplete" : "Mark as complete"}
                        />
                        <button
                          type="button"
                          onClick={() => setPeekTaskId(t.id)}
                          aria-label={`Task details: ${t.title}`}
                          className="min-w-0 flex-1 rounded-md py-0.5 text-left outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50 whitespace-normal"
                        >
                          <div
                            className={[
                              "truncate text-xs font-medium",
                              t.status === "done"
                                ? "text-muted-foreground line-through"
                                : "text-foreground",
                            ].join(" ")}
                          >
                            {agingLabel ? (
                              <span className="mr-1 inline-flex max-w-[9rem] truncate rounded-sm bg-orange-500/90 px-1 py-px text-[8px] font-semibold leading-tight text-white" title={agingLabel}>
                                {agingLabel}
                              </span>
                            ) : null}
                            {t.title}
                          </div>
                          <div
                            className={[
                              "mt-0.5 text-[10px] tabular-nums text-muted-foreground",
                              overdue ? "font-medium" : "",
                            ].join(" ")}
                          >
                            @{t.assigned_to || "self"} · {t.due_date} {String(t.due_time).slice(0, 5)}
                          </div>
                          {t.status === "done" ? (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              {completionLabel(t.completed_at)}
                              {t.completed_by_name?.trim() ? ` · ${t.completed_by_name.trim()}` : ""}
                            </div>
                          ) : formatUpdatedByLine(t) ? (
                            <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground break-words">
                              {formatUpdatedByLine(t)}
                            </div>
                          ) : null}
                        </button>
                        <div className="flex shrink-0 flex-col items-end self-stretch">
                          <span className="rounded-full bg-muted/90 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-[0_1px_3px_rgba(61,45,33,0.08)] dark:bg-muted dark:shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
                            {badgeLabel(t.type)}
                          </span>
                          <div className="mt-auto flex gap-0.5 pt-0.5">
                            {scratchpadGmailHref(t) ? (
                              <Link
                                href={scratchpadGmailHref(t)!}
                                className={watchRowIconBtn}
                                aria-label="Open mail in Scratchpad"
                                title="Open mail"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <IconMail />
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(t.id);
                                setEditDraft(draftFromTask(t));
                              }}
                              className={watchRowIconBtn}
                              aria-label="Edit task"
                              title="Edit"
                            >
                              <IconPencil />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteTask(t)}
                              disabled={savingId === t.id}
                              className={watchRowIconBtn}
                              aria-label="Delete task"
                              title="Delete"
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                );
              })}
            </div>
          )}

          <div className="mt-2.5">
            <Link
              href="/tasks"
              className="inline-flex h-7 items-center rounded-full bg-muted px-2.5 text-[11px] font-medium text-foreground shadow-[0_2px_8px_rgba(61,45,33,0.08)] hover:bg-foreground/5 dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
            >
              Open Tasks
            </Link>
          </div>
        </div>
      </div>

      <TaskQuickDetailModal
        task={peekLive}
        onClose={() => setPeekTaskId(null)}
        onEdit={() => {
          if (!peekLive) return;
          setPeekTaskId(null);
          setEditingId(peekLive.id);
          setEditDraft(draftFromTask(peekLive));
        }}
        onDelete={() => {
          if (!peekLive) return;
          setPeekTaskId(null);
          void deleteTask(peekLive);
        }}
        onToggleComplete={() => {
          if (!peekLive) return;
          void toggleTaskStatus(peekLive);
        }}
        saving={!!peekLive && savingId === peekLive.id}
      />
    </div>
  );
}

