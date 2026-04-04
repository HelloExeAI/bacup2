"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTaskStore, type Task } from "@/store/taskStore";
import { useUserStore } from "@/store/userStore";
import { isTaskSelfAssigned } from "@/lib/tasks/assignee";
import { isTaskOverdue, overdueAgingLabel, taskDueDateTime } from "@/lib/tasks/taskOverdue";
import { formatTaskActorHint, formatUpdatedByLine } from "@/lib/tasks/actorLabels";
import { TaskDescriptionAiField } from "@/modules/tasks/TaskDescriptionAiField";
import type { TaskType } from "@/store/taskStore";

export type OverdueScope = "all" | "self" | "team";

const rowSurface =
  "rounded-xl bg-muted p-3 shadow-[0_1px_0_rgba(70,54,39,0.04),0_8px_20px_rgba(61,45,33,0.1)] dark:shadow-[0_8px_22px_rgba(0,0,0,0.35)]";

const overdueRowSurface =
  "rounded-xl bg-orange-500/[0.09] p-3 shadow-[0_1px_0_rgba(180,90,30,0.08),0_8px_20px_rgba(180,90,30,0.12)] dark:bg-orange-500/[0.14] dark:shadow-[0_8px_22px_rgba(0,0,0,0.4)]";

function badgeLabel(type?: string) {
  if (type === "followup") return "Follow-up";
  if (type === "reminder") return "Reminder";
  return "Todo";
}

function normalizeDueTime(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "09:00";
  const h = Math.min(23, Math.max(0, Number(m[1]) || 0));
  const min = Math.min(59, Math.max(0, Number(m[2]) || 0));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

type EditDraft = {
  title: string;
  description: string;
  due_date: string;
  due_time: string;
  assigned_to: string;
  type: TaskType;
};

function draftFromTask(t: Task): EditDraft {
  return {
    title: t.title,
    description: t.description ?? "",
    due_date: t.due_date,
    due_time: String(t.due_time ?? "09:00").slice(0, 5),
    assigned_to: (t.assigned_to || "self").trim(),
    type: t.type,
  };
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
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

const roundIconBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-[0_2px_8px_rgba(61,45,33,0.1)] transition-[transform,background-color,opacity] active:scale-95 disabled:pointer-events-none disabled:opacity-45";

export function OverdueListModal({
  open,
  onClose,
  initialScope = "all",
}: {
  open: boolean;
  onClose: () => void;
  initialScope?: OverdueScope;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const setTasks = useTaskStore((s) => s.setTasks);
  const profile = useUserStore((s) => s.profile);
  const user = useUserStore((s) => s.user);

  const actorLabel = useMemo(
    () =>
      profile?.display_name?.trim() ||
      profile?.name?.trim() ||
      (typeof user?.email === "string" ? user.email.split("@")[0] : "") ||
      "You",
    [profile?.display_name, profile?.name, user?.email],
  );
  const [scope, setScope] = useState<OverdueScope>(initialScope);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    if (open) setScope(initialScope);
  }, [open, initialScope]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setEditDraft(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingId) {
          setEditingId(null);
          setEditDraft(null);
        } else onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editingId, onClose, open]);

  const now = useMemo(() => new Date(), [open, tasks]);

  const { overdueAll, counts } = useMemo(() => {
    const pending = tasks.filter((t) => t.status === "pending");
    const overdue = pending.filter((t) => isTaskOverdue(t, now));
    const selfList: Task[] = [];
    const teamList: Task[] = [];
    for (const t of overdue) {
      if (isTaskSelfAssigned(t, profile)) selfList.push(t);
      else teamList.push(t);
    }
    const sortByDue = (a: Task, b: Task) =>
      taskDueDateTime(a).getTime() - taskDueDateTime(b).getTime();
    selfList.sort(sortByDue);
    teamList.sort(sortByDue);
    overdue.sort(sortByDue);
    return {
      overdueAll: overdue,
      counts: { all: overdue.length, self: selfList.length, team: teamList.length },
    };
  }, [now, profile, tasks]);

  const visible = useMemo(() => {
    if (scope === "self") return overdueAll.filter((t) => isTaskSelfAssigned(t, profile));
    if (scope === "team") return overdueAll.filter((t) => !isTaskSelfAssigned(t, profile));
    return overdueAll;
  }, [overdueAll, profile, scope]);

  const updateTaskLocal = useCallback(
    (id: string, patch: Partial<Task>) => {
      const next = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
      setTasks(next);
    },
    [setTasks, tasks],
  );

  const toggleTaskStatus = useCallback(
    async (t: Task) => {
      if (savingId || editingId === t.id) return;
      const nextStatus = "done" as const;
      setSavingId(t.id);
      const beforeStatus = t.status;
      const beforeCompletedAt = t.completed_at;
      const optimisticCompleted = new Date().toISOString();
      updateTaskLocal(t.id, {
        status: nextStatus,
        completed_at: optimisticCompleted,
        completed_by_name: actorLabel,
      });
      try {
        const res = await fetch(`/api/tasks/${t.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const j = (await res.json().catch(() => null)) as { task?: Task } | null;
        if (!res.ok) throw new Error();
        if (j?.task) updateTaskLocal(t.id, j.task);
      } catch {
        updateTaskLocal(t.id, { status: beforeStatus, completed_at: beforeCompletedAt });
      } finally {
        setSavingId(null);
      }
    },
    [editingId, savingId, updateTaskLocal],
  );

  const startEdit = useCallback((t: Task) => {
    setEditingId(t.id);
    setEditDraft(draftFromTask(t));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft(null);
  }, []);

  const saveEdits = useCallback(
    async (t: Task) => {
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
      updateTaskLocal(t.id, {
        title,
        description,
        due_date,
        due_time,
        assigned_to,
        type,
        last_edited_by_name: actorLabel,
      });
      try {
        const res = await fetch(`/api/tasks/${t.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, description, due_date, due_time, assigned_to, type }),
        });
        const j = (await res.json().catch(() => null)) as { task?: Task } | null;
        if (!res.ok) throw new Error();
        if (j?.task) updateTaskLocal(t.id, j.task);
        setEditingId(null);
        setEditDraft(null);
      } catch {
        updateTaskLocal(t.id, before);
      } finally {
        setSavingId(null);
      }
    },
    [editDraft, savingId, updateTaskLocal, actorLabel],
  );

  if (!open) return null;

  const tabs: { id: OverdueScope; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "self", label: "You", count: counts.self },
    { id: "team", label: "Team", count: counts.team },
  ];

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Close overdue list"
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
      />
      <div className="absolute left-1/2 top-10 z-[61] w-[min(680px,calc(100vw-24px))] -translate-x-1/2 rounded-xl bg-background shadow-[0_1px_0_rgba(70,54,39,0.05),0_14px_44px_rgba(61,45,33,0.16)] dark:shadow-[0_14px_48px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Overdue tasks</div>
            <div className="text-[11px] text-muted-foreground">
              {counts.all} total · {counts.self} you · {counts.team} team
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

        <div className="px-3 pb-3 pt-0">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const active = scope === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScope(tab.id)}
                  className={[
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-[box-shadow,background-color]",
                    active
                      ? "bg-ring/20 text-foreground shadow-[0_4px_14px_rgba(61,45,33,0.14)] dark:shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
                      : "bg-muted/90 text-muted-foreground shadow-[0_2px_8px_rgba(61,45,33,0.06)] hover:bg-muted dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)]",
                  ].join(" ")}
                >
                  {tab.label}
                  <span className="tabular-nums opacity-80">({tab.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-[min(68vh,560px)] overflow-y-auto p-3">
          {visible.length === 0 ? (
            <div className={rowSurface}>
              <p className="text-sm text-muted-foreground">
                No overdue tasks in this view.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((t) => {
                const agingLabel = overdueAgingLabel(t, now);
                const mine = isTaskSelfAssigned(t, profile);
                const isEditing = editingId === t.id;
                const busy = savingId === t.id;

                const actorHint = formatTaskActorHint(t);
                return (
                  <li key={t.id} className={overdueRowSurface} title={actorHint || undefined}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {agingLabel ? (
                            <span
                              className="inline-flex max-w-[min(100%,14rem)] truncate rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                              title={agingLabel}
                            >
                              {agingLabel}
                            </span>
                          ) : null}
                          <span className="text-sm font-medium text-foreground">{t.title}</span>
                          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                            {badgeLabel(t.type)}
                          </span>
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {mine ? "You" : "Team"}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                          @{t.assigned_to || "self"} · Due {t.due_date}{" "}
                          {String(t.due_time).slice(0, 5)}
                        </div>
                        {formatUpdatedByLine(t) ? (
                          <div className="mt-1 text-[10px] leading-snug text-muted-foreground break-words">
                            {formatUpdatedByLine(t)}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-start">
                        <button
                          type="button"
                          disabled={busy || isEditing}
                          onClick={() => startEdit(t)}
                          className={`${roundIconBtn} bg-muted text-foreground hover:bg-foreground/10 dark:bg-muted/90`}
                          aria-label="Edit task"
                          title="Edit"
                        >
                          <IconPencil />
                        </button>
                        <button
                          type="button"
                          disabled={busy || isEditing}
                          onClick={() => void toggleTaskStatus(t)}
                          className={`${roundIconBtn} bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500`}
                          aria-label="Mark done"
                          title="Mark done"
                        >
                          <IconCheck />
                        </button>
                      </div>
                    </div>

                    {isEditing && editDraft ? (
                      <div className="mt-3 space-y-2 rounded-lg bg-background/90 p-3 shadow-[0_4px_16px_rgba(61,45,33,0.1)] dark:bg-background/50 dark:shadow-[0_4px_18px_rgba(0,0,0,0.35)]">
                        <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Title
                          <input
                            value={editDraft.title}
                            onChange={(e) => setEditDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                            className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none ring-0 focus-visible:ring-2 focus-visible:ring-ring/50"
                          />
                        </label>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                        <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Assigned to
                          <input
                            value={editDraft.assigned_to}
                            onChange={(e) =>
                              setEditDraft((d) =>
                                d ? { ...d, assigned_to: e.target.value } : d,
                              )
                            }
                            placeholder="self or name"
                            className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          />
                        </label>
                        <div className="mt-1">
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
                            disabled={busy}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void saveEdits(t)}
                            className="rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background shadow-md hover:opacity-90 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={cancelEdit}
                            className="rounded-full bg-muted px-4 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-foreground/5 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
