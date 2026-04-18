import { create } from "zustand";

export type TaskStatus = "pending" | "done";
export type TaskSource = "scratchpad" | "manual" | "ai" | "email";
export type TaskType = "todo" | "followup" | "reminder";

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string; // YYYY-MM-DD
  due_time: string; // HH:MM (24h)
  type: TaskType;
  assigned_to: string;
  status: TaskStatus;
  completed_at: string | null;
  /** Set when status becomes done — profile name of the signed-in user. */
  completed_by_name?: string | null;
  /** Set on content edits (title, due, assignee, type, description). */
  last_edited_by_name?: string | null;
  source: TaskSource;
  /** Reply later / draft follow-up (Gmail). */
  gmail_followup_kind?: string | null;
  gmail_message_id?: string | null;
  gmail_thread_id?: string | null;
  gmail_draft_id?: string | null;
  connected_account_id?: string | null;
  created_at: string;
  /** Workspace hub bulk automate follow-up email sent successfully at this time. */
  automate_followup_sent_at?: string | null;
  /** Populated for materialized recurring instances */
  series_id?: string | null;
  recurrence_label?: string | null;
};

type TaskState = {
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  addTasks: (tasks: Task[]) => void;
  addOptimisticTasks: (tasks: Omit<Task, "id" | "created_at">[]) => string[];
  replaceOptimistic: (tempId: string, real: Task) => void;
  removeByIds: (ids: string[]) => void;
  clear: () => void;
};

function sortNewestFirst(a: Task, b: Task) {
  return (b.created_at || "").localeCompare(a.created_at || "");
}

function dedupeByIdKeepLatest(tasks: Task[]) {
  const map = new Map<string, Task>();
  for (const t of tasks) {
    if (!t?.id) continue;
    const prev = map.get(t.id);
    if (!prev) {
      map.set(t.id, t);
      continue;
    }
    // Keep the newest row by created_at (fallback to keeping the incoming one).
    const prevTs = prev.created_at ?? "";
    const nextTs = t.created_at ?? "";
    map.set(t.id, nextTs.localeCompare(prevTs) > 0 ? t : prev);
  }
  return Array.from(map.values());
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  setTasks: (tasks) => set({ tasks: dedupeByIdKeepLatest([...tasks]).sort(sortNewestFirst) }),
  addTasks: (tasks) =>
    set((s) => ({ tasks: dedupeByIdKeepLatest([...tasks, ...s.tasks]).sort(sortNewestFirst) })),
  addOptimisticTasks: (drafts) => {
    const now = new Date().toISOString();
    const tempIds = drafts.map(() => `temp_${crypto.randomUUID()}`);
    const optimistic: Task[] = drafts.map((d, i) => ({
      ...d,
      id: tempIds[i]!,
      created_at: now,
    }));
    set((s) => ({ tasks: dedupeByIdKeepLatest([...optimistic, ...s.tasks]).sort(sortNewestFirst) }));
    return tempIds;
  },
  replaceOptimistic: (tempId, real) =>
    set((s) => ({
      tasks: dedupeByIdKeepLatest(s.tasks.map((t) => (t.id === tempId ? real : t))).sort(
        sortNewestFirst,
      ),
    })),
  removeByIds: (ids) =>
    set((s) => ({ tasks: s.tasks.filter((t) => !ids.includes(t.id)) })),
  clear: () => set({ tasks: [] }),
}));

