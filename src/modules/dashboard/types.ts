import type { Task } from "@/store/taskStore";

export type DashboardViewOption = {
  user_id: string;
  label: string;
  kind: "self" | "team";
  /** Department slug when assigned (e.g. `sales`). */
  department?: string | null;
  /** Human-readable department for UI. */
  department_label?: string | null;
};

export type DashboardKpis = {
  overdue: number;
  waitingResponses: number;
  activePriorities: number;
  todaysLoad: number;
};

export type DashboardOverviewPayload = {
  selectedViewUserId: string;
  canViewOthers: boolean;
  viewOptions: DashboardViewOption[];
  kpis: DashboardKpis;
  tasks: Task[];
};

