import { z } from "zod";

/** KPI focus lens shared by Overview Phase B (Follow) and Phase C (Outbound draft). */
export const OverviewLensSchema = z.enum([
  "all",
  "overdue",
  "todaysLoad",
  "followups",
  "priorities",
  "decisions",
]);

export type OverviewLens = z.infer<typeof OverviewLensSchema>;

export const OVERVIEW_LENS_CHIPS: { id: OverviewLens; label: string }[] = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "todaysLoad", label: "Today" },
  { id: "followups", label: "Follow-ups" },
  { id: "priorities", label: "Priorities" },
  { id: "decisions", label: "Decisions" },
];
