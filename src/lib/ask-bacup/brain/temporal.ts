import { calendarYmdInTimeZone } from "@/lib/email/calendarYmd";

import type { IsoDate, WeekWindow } from "./types";

export function addDaysYmd(ymd: IsoDate, deltaDays: number): IsoDate {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function longGregorianDate(ymd: IsoDate): string {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function buildWeekWindow(timezone: string, now = new Date()): WeekWindow {
  const today = calendarYmdInTimeZone(timezone, now);
  const tomorrow = addDaysYmd(today, 1);
  const days: IsoDate[] = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(addDaysYmd(today, i));
  }
  return {
    timezone,
    today,
    tomorrow,
    weekStart: today,
    weekEnd: addDaysYmd(today, 6),
    days,
  };
}
