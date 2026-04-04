/**
 * Ask Bacup operating brain — layered context assembly.
 *
 * Layers (see `types.ts`):
 * - L0: Temporal anchor (today / 7-day window)
 * - L1: Operating contract (how to merge calendar + tasks for today vs week)
 * - L2: Today's calendar (Bacup events + Google Calendar, repeated tagged)
 * - L3: Seven-day calendar runway (per-day buckets)
 * - L4: Tasks runway (due today, due by day in window, recurrence series)
 *
 * `buildWorkspaceContext` appends supplementary slices (scratchpad, milestones, team).
 */
export type { BrainLayerChunk, BrainLayerId, NormalizedCalendarRow, TaskBrainRow, WeekWindow } from "./types";
export { assembleBrainLayers, renderBrainMarkdown } from "./assemble";
export { buildWeekWindow, addDaysYmd, longGregorianDate } from "./temporal";
