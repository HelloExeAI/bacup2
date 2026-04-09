/** Overview (/workspace) KPI tiles dispatch here; Today&apos;s Focus in the sidebar handles each action (modal / watch list / scroll). */

export type OverviewKpiKind = "overdue" | "todaysLoad" | "followups" | "priorities" | "pendingDecisions";

type Listener = (kind: OverviewKpiKind) => void;

let listener: Listener | null = null;

export function setOverviewKpiListener(fn: Listener | null) {
  listener = fn;
}

export function requestOverviewKpi(kind: OverviewKpiKind) {
  listener?.(kind);
}
