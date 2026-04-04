import { create } from "zustand";

import type { Task } from "./taskStore";

/**
 * Tasks for the Executive Cockpit’s current view (self or team). Used by the global
 * notification bell on /dashboard so badge/panel match the cockpit without overwriting
 * `useTaskStore` (which stays “my tasks” for the rest of the app).
 */
type State = {
  dashboardScopeTasks: Task[] | null;
  setDashboardScopeTasks: (tasks: Task[] | null) => void;
};

export const useNotificationScopeStore = create<State>((set) => ({
  dashboardScopeTasks: null,
  setDashboardScopeTasks: (tasks) => set({ dashboardScopeTasks: tasks }),
}));
