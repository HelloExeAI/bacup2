"use client";

import * as React from "react";

import type { TimelineItem, TimelineSource } from "@/lib/timeline/types";
import type { Task, TaskType } from "@/store/taskStore";
import { useTaskStore } from "@/store/taskStore";
import { BodyPortal } from "@/components/portal/BodyPortal";
import { TaskQuickDetailModal } from "@/modules/tasks/TaskQuickDetailModal";
import { defaultDueTimeQuarterHour } from "@/lib/datetime/quarterHour";
import { TaskDescriptionAiField } from "@/modules/tasks/TaskDescriptionAiField";
import { fetchTodayTimelineCached, peekTodayTimelineCache } from "@/lib/timeline/todayClientCache";

const timelineEventCardClass =
  "rounded-lg bg-muted p-2 shadow-[0_1px_0_rgba(70,54,39,0.04),0_10px_24px_rgba(61,45,33,0.1)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.38)]";

const linkClass =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground";

const ICON_BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted/70 text-foreground shadow-[0_1px_3px_rgba(61,45,33,0.08)] transition-[transform,background-color,opacity] hover:bg-foreground/5 active:scale-95 disabled:pointer-events-none disabled:opacity-45 dark:shadow-[0_1px_6px_rgba(0,0,0,0.22)]";

const TIMELINE_ITEM_DESC_PREFIX = "timeline_item_key:";

function ymdToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractLocalDueDateFromStart(start: string | null): string {
  if (!start) return ymdToday();
  if (!start.includes("T")) return start.slice(0, 10);
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return ymdToday();
  return toYmd(d);
}

function extractLocalDueTimeFromStart(start: string | null): string {
  if (!start) return defaultDueTimeQuarterHour();
  if (!start.includes("T")) return defaultDueTimeQuarterHour();
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return defaultDueTimeQuarterHour();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatEventTime(iso: string | null): string {
  if (!iso) return "";
  if (!iso.includes("T")) return "All day";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function durationLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  if (!start.includes("T") || !end.includes("T")) return "All day";
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  const m = Math.round((b - a) / 60000);
  if (m < 1) return null;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function sourceLabel(source: TimelineItem["source"]): string {
  switch (source) {
    case "google":
      return "Google";
    case "outlook":
      return "Outlook";
    case "imap":
      return "Email";
    case "task":
      return "Task";
    case "milestone":
      return "Milestone";
    default:
      return "";
  }
}

function accentBarClass(source: TimelineItem["source"]): string {
  switch (source) {
    case "outlook":
      return "bg-sky-500/55 dark:bg-sky-400/45";
    case "imap":
      return "bg-violet-500/55 dark:bg-violet-400/45";
    case "task":
      return "bg-amber-500/55 dark:bg-amber-400/45";
    case "milestone":
      return "bg-emerald-500/55 dark:bg-emerald-400/45";
    default:
      return "bg-blue-500/55 dark:bg-blue-400/45";
  }
}

function timelineItemDescriptionKey(itemKey: string) {
  return `${TIMELINE_ITEM_DESC_PREFIX}${itemKey}`;
}

function IconCompleteToggle({ done }: { done: boolean }) {
  if (done) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" fill="currentColor" className="text-emerald-500/90" />
        <path d="M8 12l2.5 2.5L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" className="text-muted-foreground" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function normalizeDueTime(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "09:00";
  const h = Math.min(23, Math.max(0, Number(m[1]) || 0));
  const min = Math.min(59, Math.max(0, Number(m[2]) || 0));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalizeTaskType(raw: string): TaskType {
  if (raw === "followup" || raw === "reminder" || raw === "todo") return raw;
  return "todo";
}

type TaskEditorDraft = {
  title: string;
  description: string;
  due_date: string;
  due_time: string;
  assigned_to: string;
  type: TaskType;
};

function TimelineTaskEditorModal({
  task,
  open,
  saving,
  onCancel,
  onSave,
  onDelete,
  onToggleComplete,
}: {
  task: Task;
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: TaskEditorDraft) => void;
  onDelete: () => void;
  onToggleComplete: () => void;
}) {
  const [draft, setDraft] = React.useState<TaskEditorDraft>(() => ({
    title: task.title,
    description: task.description ?? "",
    due_date: task.due_date,
    due_time: String(task.due_time ?? "09:00").slice(0, 5),
    assigned_to: task.assigned_to ?? "self",
    type: normalizeTaskType(task.type),
  }));

  React.useEffect(() => {
    if (!open) return;
    setDraft({
      title: task.title,
      description: task.description ?? "",
      due_date: task.due_date,
      due_time: String(task.due_time ?? "09:00").slice(0, 5),
      assigned_to: task.assigned_to ?? "self",
      type: normalizeTaskType(task.type),
    });
  }, [open, task]);

  if (!open) return null;

  const done = task.status === "done";
  return (
    <BodyPortal>
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-xl border border-border/60 bg-background p-4 shadow-[0_12px_48px_rgba(0,0,0,0.2)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">Edit task</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {task.type} · Due {task.due_date} {String(task.due_time).slice(0, 5)}
            </div>
          </div>
          <button type="button" className={ICON_BTN} aria-label="Close" onClick={onCancel} title="Close">
            <IconClose />
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <label className="block">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Title</div>
            <input
              value={draft.title}
              disabled={saving}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            />
          </label>

          <label className="block">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Description</div>
            <textarea
              value={draft.description}
              disabled={saving}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={4}
              placeholder="Optional notes"
              className="mt-1 w-full resize-y rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            />
            {/* Optional AI redraft for description */}
            <div className="mt-2">
              <TaskDescriptionAiField
                value={draft.description}
                onChange={(next) => setDraft((d) => ({ ...d, description: next }))}
                title={draft.title}
                dueDate={draft.due_date}
                dueTime={draft.due_time}
                assignedTo={draft.assigned_to}
                taskType={draft.type}
                disabled={saving}
              />
            </div>
          </label>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Due date</div>
              <input
                type="date"
                value={draft.due_date}
                disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))}
                className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Due time</div>
              <input
                type="time"
                value={draft.due_time}
                disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, due_time: e.target.value }))}
                className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Assigned to</div>
              <input
                value={draft.assigned_to}
                disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, assigned_to: e.target.value }))}
                className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Type</div>
              <select
                value={draft.type}
                disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, type: normalizeTaskType(e.target.value) }))}
                className="mt-1 w-full rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                <option value="todo">Todo</option>
                <option value="followup">Follow-up</option>
                <option value="reminder">Reminder</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
          <button
            type="button"
            disabled={saving}
            onClick={onToggleComplete}
            className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-foreground/5 disabled:opacity-50"
          >
            {done ? "Mark pending" : "Mark complete"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onDelete}
            className="rounded-full bg-red-500/[0.10] px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-500/[0.14] disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(draft)}
            className="rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background shadow-md hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-full bg-muted px-4 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-foreground/5 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
    </BodyPortal>
  );
}

function TimelineCalendarEventModal({
  item,
  done,
  onToggleComplete,
  onClose,
}: {
  item: TimelineItem;
  done: boolean;
  onToggleComplete: () => void;
  onClose: () => void;
}) {
  const dur = item.source === "task" ? null : durationLabel(item.start, item.end);
  const att = item.attendees ?? [];
  const extra = att.length > 5 ? att.length - 5 : 0;
  const show = att.slice(0, 5);
  return (
    <BodyPortal>
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-xl border border-border/60 bg-background p-4 shadow-[0_12px_48px_rgba(0,0,0,0.2)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {sourceLabel(item.source)}
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">{item.title}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {formatEventTime(item.start)} {dur ? `· ${dur}` : ""}
            </div>
          </div>
          <button type="button" className={ICON_BTN} aria-label="Close" onClick={onClose} title="Close">
            <IconClose />
          </button>
        </div>

        {show.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-0.5">
            {show.map((a, i) => (
              <span
                key={`${item.key}-att-${i}`}
                className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-[8px] font-semibold text-foreground shadow-[0_1px_0_rgba(70,54,39,0.06)] dark:bg-background/25"
                  title={a.name ?? a.email ?? a.initials}
              >
                {a.initials}
                {a.responseStatus === "accepted" ? (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-600 text-[6px] text-white">
                    ✓
                  </span>
                ) : a.responseStatus === "declined" ? (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-600 text-[6px] text-white">
                    ×
                  </span>
                ) : null}
              </span>
            ))}
            {extra > 0 ? <span className="text-[9px] font-medium text-muted-foreground">+{extra}</span> : null}
          </div>
        ) : null}

        {att.length > 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Attendees:{" "}
            <span className="text-foreground/90">
              {att
                .map((a) => `${a.name ?? a.email ?? a.initials}${a.responseStatus ? ` (${a.responseStatus})` : ""}`)
                .join(", ")}
            </span>
          </p>
        ) : null}

        {(item.timeZone || item.location || item.description) ? (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>
                Time zone: <span className="font-medium text-foreground/90">{item.timeZone || "Local time"}</span>
              </span>
              {item.location ? (
                <span className="truncate">
                  · Location: <span className="font-medium text-foreground/90">{item.location}</span>
                </span>
              ) : null}
            </div>
            {item.description ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No description</p>
            )}
          </div>
        ) : null}

        {item.meetingLinks && item.meetingLinks.length > 0 ? (
          <div className="mt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Meeting links</div>
            <div className="mt-2 space-y-2">
              {item.meetingLinks.slice(0, 3).map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block text-[10px] ${linkClass}`}
                  title={l.url}
                >
                  {l.label || "Join"}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={onToggleComplete}
            className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-foreground/5"
          >
            {done ? "Mark pending" : "Mark complete"}
          </button>
          <button type="button" onClick={onClose} className="rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background hover:opacity-90">
            Done
          </button>
        </div>
      </div>
    </div>
    </BodyPortal>
  );
}

export function AgendaCalendarPanel() {
  const tasks = useTaskStore((s) => s.tasks);
  const addTasks = useTaskStore((s) => s.addTasks);
  const removeByIds = useTaskStore((s) => s.removeByIds);

  const initialPeek = React.useMemo(() => peekTodayTimelineCache(), []);
  const [loading, setLoading] = React.useState(!initialPeek.fresh);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<TimelineItem[]>(initialPeek.data?.items ?? []);

  const [modalItem, setModalItem] = React.useState<TimelineItem | null>(null);
  /** When set, we show the task popup for the created/selected local task. */
  const [taskOverrideId, setTaskOverrideId] = React.useState<string | null>(null);
  const [taskEditOpen, setTaskEditOpen] = React.useState(false);
  const [savingTaskId, setSavingTaskId] = React.useState<string | null>(null);
  const [savingExternalKey, setSavingExternalKey] = React.useState<string | null>(null);

  const load = React.useCallback(async (opts?: { force?: boolean }) => {
    const force = Boolean(opts?.force);
    const peek = force ? { fresh: false, data: null } : peekTodayTimelineCache();
    if (!force && peek.fresh && peek.data) {
      setItems(peek.data.items);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchTodayTimelineCached({ force });
      setItems(data.items ?? []);
    } catch {
      setError("Could not load timeline.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load({ force: false });
  }, [load]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const ig = sp.get("integrations");
    if (ig !== "google_connected" && ig !== "microsoft_connected") return;
    void load({ force: true });
    const u = new URL(window.location.href);
    u.searchParams.delete("integrations");
    window.history.replaceState({}, "", `${u.pathname}${u.search}`);
  }, [load]);

  React.useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const isExternalItemDone = React.useCallback(
    (itemKey: string) => {
      const descKey = timelineItemDescriptionKey(itemKey);
      return tasks.some((t) => t.description === descKey && t.status === "done");
    },
    [tasks],
  );

  const getExternalItemTask = React.useCallback(
    (itemKey: string) => {
      const descKey = timelineItemDescriptionKey(itemKey);
      return tasks.find((t) => t.description === descKey) ?? null;
    },
    [tasks],
  );

  const toggleTaskStatusById = React.useCallback(
    async (taskId: string) => {
      const t = tasks.find((x) => x.id === taskId);
      const beforeStatus = t?.status ?? "pending";
      const nextStatus = beforeStatus === "done" ? "pending" : "done";

      setSavingTaskId(taskId);
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const j = (await res.json().catch(() => null)) as { task?: Task; error?: string } | null;
        if (!res.ok) throw new Error(j?.error || "Failed to update task");
        if (j?.task) addTasks([j.task]);
        await load({ force: true });
      } finally {
        setSavingTaskId(null);
      }
    },
    [addTasks, load, tasks],
  );

  const toggleExternalTimelineItem = React.useCallback(
    async (item: TimelineItem) => {
      const targetDone = !isExternalItemDone(item.key);
      const targetStatus: "pending" | "done" = targetDone ? "done" : "pending";

      const due_date = extractLocalDueDateFromStart(item.start);
      const due_time = extractLocalDueTimeFromStart(item.start);

      setSavingExternalKey(item.key);
      try {
        const res = await fetch("/api/timeline/items/toggle", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            itemKey: item.key,
            title: item.title,
            due_date,
            due_time,
            target_status: targetStatus,
          }),
        });
        const j = (await res.json().catch(() => null)) as { task?: Task; error?: string } | null;
        if (!res.ok) throw new Error(j?.error || "Failed to mark complete");
        if (j?.task) addTasks([j.task]);
        await load({ force: true });
      } finally {
        setSavingExternalKey(null);
      }
    },
    [addTasks, isExternalItemDone, load],
  );

  const visibleItems = React.useMemo(() => {
    // Hide external items that the user marked complete in Bacup.
    return items.filter((it) => {
      if (it.source === "task") return true;
      const descKey = timelineItemDescriptionKey(it.key);
      return !tasks.some((t) => t.description === descKey);
    });
  }, [items, tasks]);

  const modalTask = React.useMemo(() => {
    const taskId = modalItem?.source === "task" ? modalItem.taskId : taskOverrideId;
    if (!taskId) return null;
    return tasks.find((t) => t.id === taskId) ?? null;
  }, [modalItem, tasks, taskOverrideId]);

  const openModal = (it: TimelineItem) => {
    setModalItem(it);
    setTaskOverrideId(null);
    setTaskEditOpen(false);
  };

  const closeModal = () => {
    setModalItem(null);
    setTaskOverrideId(null);
    setTaskEditOpen(false);
  };

  const modalTaskDelete = async () => {
    if (!modalTask) return;
    setSavingTaskId(modalTask.id);
    try {
      removeByIds([modalTask.id]);
      const res = await fetch(`/api/tasks/${modalTask.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Failed to delete task");
      closeModal();
      await load({ force: true });
    } finally {
      setSavingTaskId(null);
    }
  };

  const modalTaskSave = async (draft: TaskEditorDraft) => {
    if (!modalTask) return;
    const title = draft.title.trim();
    if (!title) return;

    setSavingTaskId(modalTask.id);
    try {
      const res = await fetch(`/api/tasks/${modalTask.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: draft.description.trim() ? draft.description.trim() : null,
          due_date: draft.due_date,
          due_time: normalizeDueTime(draft.due_time),
          assigned_to: draft.assigned_to.trim() || "self",
          type: draft.type,
        }),
      });
      const j = (await res.json().catch(() => null)) as { task?: Task; error?: string } | null;
      if (!res.ok) throw new Error(j?.error || "Failed to save task");
      if (j?.task) addTasks([j.task]);
      setTaskEditOpen(false);
      await load({ force: true });
    } finally {
      setSavingTaskId(null);
    }
  };

  return (
    <section className="flex max-h-[min(58vh,520px)] min-h-0 flex-col overflow-hidden rounded-xl bacup-surface p-3">
      <div className="shrink-0">
        <div className="text-xs font-semibold tracking-wide text-foreground">Timeline</div>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        {loading ? (
          <p className="text-xs text-muted-foreground">Analysing…</p>
        ) : error ? (
          <p className="text-xs text-red-600 dark:text-red-400/90">{error}</p>
        ) : (
          <div>
            {visibleItems.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {visibleItems.map((ev) => {
                  const dur = ev.source === "task" ? "15m" : durationLabel(ev.start, ev.end);
                  const att = ev.attendees ?? [];
                  const extra = att.length > 5 ? att.length - 5 : 0;
                  const show = att.slice(0, 5);

                  const done =
                    ev.source === "task"
                      ? tasks.find((t) => t.id === ev.taskId)?.status === "done"
                      : isExternalItemDone(ev.key);

                  const toggle = async (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (ev.source === "task") {
                      if (!ev.taskId) return;
                      await toggleTaskStatusById(ev.taskId);
                    } else {
                      await toggleExternalTimelineItem(ev);
                    }
                  };

                  return (
                    <li key={ev.key}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openModal(ev)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") openModal(ev);
                        }}
                        className={`flex gap-2 ${timelineEventCardClass} cursor-pointer`}
                      >
                        <div className="flex w-[3.25rem] shrink-0 flex-col items-end self-center text-right">
                          <button
                            type="button"
                            onClick={(e) => void toggle(e)}
                            disabled={savingTaskId === ev.taskId || savingExternalKey === ev.key}
                            className="mb-1"
                            aria-label={done ? "Mark pending" : "Mark complete"}
                            title={done ? "Mark pending" : "Mark complete"}
                          >
                            <IconCompleteToggle done={done} />
                          </button>
                          <span className="text-[10px] font-medium tabular-nums text-foreground">
                            {formatEventTime(ev.start)}
                          </span>
                          {dur ? <span className="text-[9px] text-muted-foreground">{dur}</span> : null}
                        </div>
                        <div className={`w-1 shrink-0 self-stretch rounded-full ${accentBarClass(ev.source)}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                              {sourceLabel(ev.source)}
                            </span>
                          </div>
                          <p className="text-[11px] font-medium leading-snug text-foreground">{ev.title}</p>
                          {show.length > 0 ? (
                            <div className="mt-1 flex flex-wrap items-center gap-0.5">
                              {show.map((a, i) => (
                                <span
                                  key={`${ev.key}-att-${i}`}
                                  className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-[8px] font-semibold text-foreground shadow-[0_1px_0_rgba(70,54,39,0.06)] dark:bg-background/25"
                                  title={a.name ?? a.email ?? a.initials}
                                >
                                  {a.initials}
                                  {a.responseStatus === "accepted" ? (
                                    <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-600 text-[6px] text-white">
                                      ✓
                                    </span>
                                  ) : a.responseStatus === "declined" ? (
                                    <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-600 text-[6px] text-white">
                                      ×
                                    </span>
                                  ) : null}
                                </span>
                              ))}
                              {extra > 0 ? <span className="text-[9px] font-medium text-muted-foreground">+{extra}</span> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {modalTask ? (
        taskEditOpen ? (
          <TimelineTaskEditorModal
            task={modalTask}
            open={taskEditOpen}
            saving={savingTaskId === modalTask.id}
            onCancel={() => setTaskEditOpen(false)}
            onSave={(draft) => void modalTaskSave(draft)}
            onDelete={() => void modalTaskDelete()}
            onToggleComplete={() => void toggleTaskStatusById(modalTask.id)}
          />
        ) : (
          <TaskQuickDetailModal
            task={modalTask}
            onClose={closeModal}
            onEdit={() => setTaskEditOpen(true)}
            onDelete={() => void modalTaskDelete()}
            onToggleComplete={() => void toggleTaskStatusById(modalTask.id)}
            saving={savingTaskId === modalTask.id}
          />
        )
      ) : modalItem ? (
        <TimelineCalendarEventModal
          item={modalItem}
          done={isExternalItemDone(modalItem.key)}
          onToggleComplete={() => void toggleExternalTimelineItem(modalItem)}
          onClose={closeModal}
        />
      ) : null}
    </section>
  );
}
