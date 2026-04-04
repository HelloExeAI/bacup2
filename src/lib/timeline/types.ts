export type TimelineSource = "google" | "outlook" | "task" | "milestone";

export type TimelineAttendee = {
  initials: string;
  responseStatus?: string;
  name?: string;
  email?: string;
};

export type TimelineItem = {
  key: string;
  source: TimelineSource;
  title: string;
  start: string | null;
  end: string | null;
  htmlLink: string | null;
  /** Google/Outlook description/body text (best-effort). */
  description?: string | null;
  /** Calendar location or address label (best-effort). */
  location?: string | null;
  /** Calendar timezone identifier (e.g. 'America/Los_Angeles') when provided by source. */
  timeZone?: string | null;
  /** Online meeting / join URLs extracted from the event. */
  meetingLinks?: { url: string; label?: string }[];
  attendees: TimelineAttendee[];
  taskId?: string;
  taskType?: string;
  milestoneKind?: string;
};

export type TimelineTodayResult = {
  items: TimelineItem[];
  connected: {
    google: boolean;
    outlook: boolean;
  };
};
