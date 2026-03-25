import { create } from "zustand";

export type TaskStatus = "pending" | "done";
export type TaskSource = "scratchpad" | "manual" | "ai";
export type TaskType = "todo" | "followup" | "reminder";

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null; // YYYY-MM-DD
  due_time: string | null; // HH:MM (24h)
  type: TaskType;
  assigned_to: string;
  status: TaskStatus;
  source: TaskSource;
  created_at: string;
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

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  setTasks: (tasks) => set({ tasks: [...tasks].sort(sortNewestFirst) }),
  addTasks: (tasks) =>
    set((s) => ({ tasks: [...tasks, ...s.tasks].sort(sortNewestFirst) })),
  addOptimisticTasks: (drafts) => {
    const now = new Date().toISOString();
    const tempIds = drafts.map(() => `temp_${crypto.randomUUID()}`);
    const optimistic: Task[] = drafts.map((d, i) => ({
      ...d,
      id: tempIds[i]!,
      created_at: now,
    }));
    set((s) => ({ tasks: [...optimistic, ...s.tasks].sort(sortNewestFirst) }));
    return tempIds;
  },
  replaceOptimistic: (tempId, real) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === tempId ? real : t)).sort(sortNewestFirst),
    })),
  removeByIds: (ids) =>
    set((s) => ({ tasks: s.tasks.filter((t) => !ids.includes(t.id)) })),
  clear: () => set({ tasks: [] }),
}));

