import type { Task } from "@/store/taskStore";

export type DashboardViewOption = {
  user_id: string;
  label: string;
  kind: "self" | "team";
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

