/** Phase C follow automation: quiet hours, deadlines, copy templates (no DB). */

export type FollowRuleSnapshot = {
  send_mode: "manual_review" | "auto_send";
  quiet_skipped?: boolean;
  cap_skipped?: boolean;
  reminder_interval_minutes: number;
};

export function parseHm(s: string | null | undefined): { h: number; m: number } | null {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

/** Minutes from midnight for a Date in a specific IANA timezone. */
export function minutesFromMidnightInZone(now: Date, timeZone: string): number {
  const s = now.toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const [hh, mm] = s.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

/**
 * Quiet window when local time is between start and end (e.g. 22:00–07:00 crosses midnight).
 * If start/end null, never quiet.
 */
export function isQuietHours(
  now: Date,
  timeZone: string,
  startStr: string | null | undefined,
  endStr: string | null | undefined,
): boolean {
  const a = parseHm(startStr ?? null);
  const b = parseHm(endStr ?? null);
  if (!a || !b) return false;
  const start = a.h * 60 + a.m;
  const end = b.h * 60 + b.m;
  const cur = minutesFromMidnightInZone(now, timeZone);
  if (start === end) return false;
  if (start > end) {
    return cur >= start || cur < end;
  }
  return cur >= start && cur < end;
}

export function buildFollowNudgeEmail(params: {
  taskTitle: string;
  founderLabel: string;
  isUrgent: boolean;
}): { subject: string; body: string } {
  const tag = params.isUrgent ? "Reminder: " : "Quick check-in: ";
  const subject = `${tag}${params.taskTitle.slice(0, 80)}${params.taskTitle.length > 80 ? "…" : ""}`;
  const body = [
    `Hi,`,
    ``,
    `Could you share a brief status update on “${params.taskTitle.replace(/"/g, "'")}”?`,
    ``,
    `I’m tracking this in Bacup—reply when you can.`,
    ``,
    `Thanks,`,
    params.founderLabel,
  ].join("\n");
  return { subject, body };
}

export function utcDayStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
