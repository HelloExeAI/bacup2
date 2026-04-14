"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CockpitFilters } from "@/modules/dashboard/components/CockpitFilters";
import { EmptyState } from "@/modules/dashboard/components/EmptyState";
import { ExecutiveCockpitHeader } from "@/modules/dashboard/components/ExecutiveCockpitHeader";
import { KpiCards } from "@/modules/dashboard/components/KpiCards";
import { KpiActionModal } from "@/modules/dashboard/components/KpiActionModal";
import { RecurrenceReminderBanner } from "@/modules/dashboard/components/RecurrenceReminderBanner";
import { RecurringTaskModal } from "@/modules/dashboard/components/RecurringTaskModal";
import { TaskDetailScreen } from "@/modules/dashboard/components/TaskDetailScreen";
import { TaskListPanel } from "@/modules/dashboard/components/TaskListPanel";
import { TaskQuickDetailModal } from "@/modules/tasks/TaskQuickDetailModal";
import { useDashboardOverview } from "@/modules/dashboard/hooks/useDashboardOverview";
import { useNotificationScopeStore } from "@/store/notificationScopeStore";
import type { Task } from "@/store/taskStore";
import { isTaskOverdue } from "@/lib/tasks/taskOverdue";

type TypeFilter = "all" | "todo" | "followup" | "reminder";
type SourceFilter = "all" | "scratchpad" | "manual" | "ai" | "email" | "recurring";
type SortKey = "due" | "type" | "status";
type SortDir = "asc" | "desc";
type KpiKey = "overdue" | "waitingResponses" | "activePriorities" | "todaysLoad";

/** Persisted for the global notification bell so it can load the same task scope as the cockpit. */
const DASHBOARD_VIEW_USER_STORAGE_KEY = "bacup-dashboard-view-user-id";

function applyFilters(tasks: Task[], typeFilter: TypeFilter, sourceFilter: SourceFilter) {
  return tasks.filter((t) => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
    return true;
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const { data, loading, error, selectedViewUserId, changeView, reload } = useDashboardOverview();
  const setDashboardScopeTasks = useNotificationScopeStore((s) => s.setDashboardScopeTasks);

  useEffect(() => {
    if (selectedViewUserId) {
      try {
        sessionStorage.setItem(DASHBOARD_VIEW_USER_STORAGE_KEY, selectedViewUserId);
      } catch {
        /* ignore quota / private mode */
      }
    }
  }, [selectedViewUserId]);

  useEffect(() => {
    if (data?.tasks) setDashboardScopeTasks(data.tasks);
  }, [data?.tasks, setDashboardScopeTasks]);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [peekTaskId, setPeekTaskId] = useState<string | null>(null);
  const [kpiOpen, setKpiOpen] = useState<KpiKey | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortKey[]>(["due"]);
  const [sortState, setSortState] = useState<Record<SortKey, SortDir | null>>({
    due: "asc",
    type: null,
    status: null,
  });
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [cleaningEmailJunk, setCleaningEmailJunk] = useState(false);

  const viewOptions = data?.viewOptions?.length
    ? data.viewOptions
    : data?.selectedViewUserId
      ? [{ user_id: data.selectedViewUserId, label: "Self", kind: "self" as const }]
      : [];

  const selectedView =
    viewOptions.find((o) => o.user_id === selectedViewUserId) ?? viewOptions[0] ?? null;
  // "Consolidated" is effectively any non-self cockpit view (team-wide / other user).
  // Also keep a label fallback for safety.
  const isConsolidatedView =
    selectedView?.kind === "team" ||
    (selectedView?.label ?? "").toLowerCase().includes("consolidated");

  const filteredTasks = useMemo(() => {
    if (!data?.tasks) return [];
    const items = applyFilters(data.tasks, typeFilter, sourceFilter);
    const sorted = [...items].sort((a, b) => {
      for (const key of sortOrder) {
        const dir = sortState[key];
        if (!dir) continue;
        const av =
          key === "due"
            ? `${a.due_date} ${String(a.due_time).slice(0, 5)}`
            : key === "type"
              ? a.type
              : a.status;
        const bv =
          key === "due"
            ? `${b.due_date} ${String(b.due_time).slice(0, 5)}`
            : key === "type"
              ? b.type
              : b.status;
        const cmp = String(av).localeCompare(String(bv));
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
    return sorted;
  }, [data, typeFilter, sourceFilter, sortOrder, sortState]);

  const peekLive = useMemo(() => {
    if (!peekTaskId || !data?.tasks) return null;
    return data.tasks.find((t) => t.id === peekTaskId) ?? null;
  }, [data?.tasks, peekTaskId]);

  useEffect(() => {
    if (peekTaskId && data?.tasks && !data.tasks.some((t) => t.id === peekTaskId)) {
      setPeekTaskId(null);
    }
  }, [data?.tasks, peekTaskId]);

  const onSort = (key: SortKey) => {
    setSortState((prev) => {
      const next: SortDir = prev[key] === "asc" ? "desc" : "asc";
      return { ...prev, [key]: next };
    });
    setSortOrder((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const patchTask = async (
    id: string,
    patch: { title?: string; description?: string | null; status?: "pending" | "done" },
  ) => {
    if (savingId) return null;
    setSavingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      await reload(selectedViewUserId);
      return (j?.task ?? null) as Task | null;
    } finally {
      setSavingId(null);
    }
  };

  const deleteTask = async (id: string) => {
    if (savingId) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      setDetailTask((t) => (t?.id === id ? null : t));
      setPeekTaskId((pid) => (pid === id ? null : pid));
      await reload(selectedViewUserId);
    } finally {
      setSavingId(null);
    }
  };

  const toggleComplete = async (t: Task) => {
    const next = t.status === "done" ? "pending" : "done";
    const updated = await patchTask(t.id, { status: next });
    if (updated && detailTask?.id === t.id) setDetailTask(updated);
  };

  const startEdit = (t: Task) => {
    setEditingId(t.id);
    setEditingTitle(t.title);
    setEditingDescription(t.description ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
    setEditingDescription("");
  };

  const saveEdit = async (t: Task) => {
    const title = editingTitle.trim();
    if (!title) return;
    const description = editingDescription.trim() ? editingDescription.trim() : null;
    const updated = await patchTask(t.id, { title, description });
    if (updated && detailTask?.id === t.id) setDetailTask(updated);
    cancelEdit();
  };

  const cleanupEmailJunkTasks = async () => {
    if (
      !window.confirm(
        "Remove pending tasks that match job alerts, banking promos, webinars, and similar automated email patterns? This only affects tasks created from email.",
      )
    ) {
      return;
    }
    setCleaningEmailJunk(true);
    try {
      const res = await fetch("/api/tasks/cleanup-email-junk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string; deleted?: number } | null;
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      await reload(selectedViewUserId);
      if (typeof j?.deleted === "number" && j.deleted > 0) {
        window.alert(`Removed ${j.deleted} junk email task(s).`);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Cleanup failed.");
    } finally {
      setCleaningEmailJunk(false);
    }
  };

  const pauseSeries = async () => {
    if (!detailTask?.series_id || savingId) return;
    setSavingId(detailTask.id);
    try {
      const res = await fetch(`/api/recurrence/series/${detailTask.series_id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      setDetailTask(null);
      await reload(selectedViewUserId);
    } finally {
      setSavingId(null);
    }
  };

  const kpiTitle = (k: KpiKey) => {
    if (k === "overdue") return "Overdue";
    if (k === "waitingResponses") return "Waiting Responses";
    if (k === "activePriorities") return "Active Priorities";
    return "Today's Load";
  };

  const kpiTasks = useMemo(() => {
    if (!data?.tasks || !kpiOpen) return [];
    const now = new Date();
    const today = (() => {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();

    // Respect Source filter, but KPI decides type/status/time bucket.
    const base = data.tasks.filter((t) => (sourceFilter === "all" ? true : t.source === sourceFilter));
    if (kpiOpen === "overdue") return base.filter((t) => isTaskOverdue(t, now));
    if (kpiOpen === "waitingResponses") return base.filter((t) => t.status === "pending" && t.type === "followup");
    if (kpiOpen === "activePriorities") return base.filter((t) => t.status === "pending" && t.type === "todo");
    return base.filter((t) => t.status === "pending" && t.due_date === today);
  }, [data, kpiOpen, sourceFilter]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col rounded-xl bg-muted/35 p-4 shadow-[0_10px_24px_rgba(0,0,0,0.08)] md:p-5">
      <ExecutiveCockpitHeader
        showBack={!!detailTask}
        onBack={() => setDetailTask(null)}
        onClose={() => {
          // Never use router.back() here: after OAuth/login the history stack often points
          // outside the app (Google, marketing site), so "back" exits the tab or PWA.
          router.push("/scratchpad");
        }}
      />

      <div
        className={[
          "flex min-h-0 flex-1 flex-col",
          detailTask ? "min-h-0" : "justify-center",
        ].join(" ")}
      >
        {error ? (
          <EmptyState
            title="Couldn't load cockpit"
            message={error}
            actionLabel="Retry"
            onAction={() => void reload(selectedViewUserId)}
          />
        ) : null}

        {!error && data && !detailTask ? (
          <div className="flex w-full min-w-0 flex-col gap-3 py-1">
            <RecurrenceReminderBanner onResolved={() => void reload(selectedViewUserId)} />
            <KpiCards kpis={data.kpis} onSelect={(k) => setKpiOpen(k)} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRecurringOpen(true)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60"
                >
                  + Recurring task
                </button>
                {!isConsolidatedView ? (
                  <button
                    type="button"
                    onClick={() => void cleanupEmailJunkTasks()}
                    disabled={cleaningEmailJunk || loading}
                    title="Remove pending tasks that look like job alerts, banking promos, webinars, etc."
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                  >
                    {cleaningEmailJunk ? "Cleaning…" : "Remove email junk"}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="space-y-3">
              <CockpitFilters
                viewOptions={viewOptions}
                viewUserId={selectedViewUserId}
                onViewChange={(id) => void changeView(id)}
                typeFilter={typeFilter}
                onTypeChange={setTypeFilter}
                sourceFilter={sourceFilter}
                onSourceChange={setSourceFilter}
                disabled={loading}
              />
              <TaskListPanel
                tasks={filteredTasks}
                onTaskSelect={(t) => setPeekTaskId(t.id)}
                sortState={sortState}
                onSort={onSort}
              />
            </div>
          </div>
        ) : null}

        {!error && data && detailTask ? (
          <TaskDetailScreen
            task={detailTask}
            onBack={() => setDetailTask(null)}
            saving={savingId === detailTask.id}
            editing={editingId === detailTask.id}
            editingTitle={editingTitle}
            onChangeEditingTitle={setEditingTitle}
            editingDescription={editingDescription}
            onChangeEditingDescription={setEditingDescription}
            onToggleComplete={() => void toggleComplete(detailTask)}
            onStartEdit={() => startEdit(detailTask)}
            onCancelEdit={cancelEdit}
            onSaveEdit={() => void saveEdit(detailTask)}
            onDelete={() => void deleteTask(detailTask.id)}
            onPauseSeries={detailTask.series_id ? () => void pauseSeries() : undefined}
          />
        ) : null}

        {loading && !data ? (
          <EmptyState title="Loading cockpit" message="Fetching your operational view..." />
        ) : null}
      </div>

      <TaskQuickDetailModal
        task={peekLive}
        onClose={() => setPeekTaskId(null)}
        onEdit={() => {
          if (!peekLive) return;
          setPeekTaskId(null);
          setKpiOpen(null);
          setDetailTask(peekLive);
          startEdit(peekLive);
        }}
        onDelete={() => {
          if (!peekLive) return;
          setPeekTaskId(null);
          void deleteTask(peekLive.id);
        }}
        onToggleComplete={() => {
          if (!peekLive) return;
          void toggleComplete(peekLive);
        }}
        saving={!!peekLive && savingId === peekLive.id}
      />

      <RecurringTaskModal
        open={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        onCreated={() => void reload(selectedViewUserId)}
      />

      <KpiActionModal
        open={!!kpiOpen}
        title={kpiOpen ? kpiTitle(kpiOpen) : "Actions"}
        subtitle={kpiOpen && selectedView ? `View · ${selectedView.label}` : null}
        tasks={kpiTasks}
        onClose={() => setKpiOpen(null)}
        savingId={savingId}
        editingId={editingId}
        editingTitle={editingTitle}
        onChangeEditingTitle={setEditingTitle}
        editingDescription={editingDescription}
        onChangeEditingDescription={setEditingDescription}
        onSelectTask={(t) => setPeekTaskId(t.id)}
        onToggleComplete={toggleComplete}
        onStartEdit={startEdit}
        onCancelEdit={cancelEdit}
        onSaveEdit={saveEdit}
        onDelete={deleteTask}
      />
    </div>
  );
}
