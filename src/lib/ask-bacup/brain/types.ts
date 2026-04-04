/**
 * Ask Bacup "operating brain" — typed contracts between layers.
 * Layers are composed into one markdown snapshot for the LLM (not shown raw to users).
 */

export type IsoDate = string;

/** Single calendar row after normalizing Bacup DB + Google API. */
export type NormalizedCalendarRow = {
  source: "bacup" | "google";
  /** Google account when source is google */
  accountEmail?: string;
  title: string;
  date: IsoDate;
  /** HH:MM local interpretation, or null for all-day */
  time: string | null;
  /** Expanded instance of a recurring Google event, or Bacup recurrence */
  isRecurringInstance: boolean;
  linkedTaskId?: string | null;
};

export type TaskBrainRow = {
  title: string;
  status: string;
  type: string | null;
  due_date: string | null;
  due_time: string | null;
  assigned_to: string | null;
  source: string | null;
  series_id: string | null;
  recurrence_label: string | null;
};

export type BrainLayerId =
  | "L0_temporal_anchor"
  | "L1_operating_contract"
  | "L2_today_calendar"
  | "L3_week_calendar"
  | "L4_tasks_runway";

export type BrainLayerChunk = {
  id: BrainLayerId;
  title: string;
  body: string;
};

export type WeekWindow = {
  timezone: string;
  today: IsoDate;
  tomorrow: IsoDate;
  /** Inclusive rolling 7-day window: today .. today+6 */
  weekStart: IsoDate;
  weekEnd: IsoDate;
  days: IsoDate[];
};
