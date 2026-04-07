import { calendarYmdInTimeZone } from "@/lib/email/calendarYmd";

/** First N significant words — stable dedupe key for same email / similar titles. */
export function normalizeTitleFingerprint(title: string, wordCount = 6): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  return words.slice(0, wordCount).join(" ");
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "and",
  "or",
  "at",
  "on",
  "in",
  "of",
  "with",
]);

export function emailTaskDedupeKey(gmailMessageId: string, title: string): string {
  return `${gmailMessageId}|${normalizeTitleFingerprint(title)}`;
}

/** follow-up is for delegated / waiting-on-others work; self-owned actions stay todo. */
export function normalizeTaskTypeForSelf(
  type: "todo" | "followup" | "reminder",
  assigned_to: string,
): "todo" | "followup" | "reminder" {
  const self =
    !assigned_to ||
    assigned_to.trim().toLowerCase() === "self" ||
    assigned_to.trim().toLowerCase() === "@self";
  if (self && type === "followup") return "todo";
  return type;
}

export function addDaysToYmdInTz(ymd: string, deltaDays: number, tz: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return calendarYmdInTimeZone(tz, base);
}

function weekdayShortInTz(ymd: string, tz: string): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
  return fmt.format(utc);
}

const DOW_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Next calendar day in `tz` whose weekday matches `targetDow` (0=Sun … 6=Sat), on or after `baseYmd`. */
export function nextWeekdayOnOrAfterYmd(baseYmd: string, targetDow: number, tz: string): string {
  let cur = baseYmd;
  for (let i = 0; i < 14; i++) {
    const short = weekdayShortInTz(cur, tz).slice(0, 3).toLowerCase();
    const dow = DOW_MAP[short] ?? 0;
    if (dow === targetDow) return cur;
    cur = addDaysToYmdInTz(cur, 1, tz);
  }
  return baseYmd;
}

/** First matching weekday in the next 7 calendar days starting `baseYmd` (e.g. "Friday" from Wed → this Fri). */
function firstWeekdayOnOrAfter(baseYmd: string, targetDow: number, tz: string): string {
  let cur = baseYmd;
  for (let i = 0; i < 7; i++) {
    const short = weekdayShortInTz(cur, tz).slice(0, 3).toLowerCase();
    const dow = DOW_MAP[short] ?? 0;
    if (dow === targetDow) return cur;
    cur = addDaysToYmdInTz(cur, 1, tz);
  }
  return baseYmd;
}

function weekdayNameToDow(name: string): number | null {
  const n = name.toLowerCase();
  const map: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[n] ?? null;
}

export type ParsedNaturalSchedule = {
  due_date: string | null;
  due_time: string | null;
};

/**
 * Best-effort parse of English date/time hints in titles (does not replace model output when both agree).
 */
export function parseNaturalScheduleFromTitle(
  title: string,
  baseYmd: string,
  timeZone: string,
): ParsedNaturalSchedule {
  const t = title;
  const lower = t.toLowerCase();
  let due_date: string | null = null;
  let due_time: string | null = null;

  if (/\btomorrow\b/i.test(t)) {
    due_date = addDaysToYmdInTz(baseYmd, 1, timeZone);
  } else if (/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(t)) {
    const m = t.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const name = m?.[1] ?? "";
    const target = weekdayNameToDow(name);
    if (target !== null) {
      const start = addDaysToYmdInTz(baseYmd, 7, timeZone);
      due_date = nextWeekdayOnOrAfterYmd(start, target, timeZone);
    }
  } else if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(t)) {
    const m = t.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const name = m?.[1] ?? "";
    const target = weekdayNameToDow(name);
    if (target !== null) {
      due_date = firstWeekdayOnOrAfter(baseYmd, target, timeZone);
    }
  } else if (/\btoday\b/i.test(t)) {
    due_date = baseYmd;
  }

  const timeParsed = parseTimeFromNaturalLanguage(t);
  if (timeParsed) {
    due_time = `${String(timeParsed.h).padStart(2, "0")}:${String(timeParsed.m).padStart(2, "0")}`;
  } else if (/\bmorning\b/i.test(lower) && !/\b\d{1,2}\s*(:\d{2})?\s*(am|pm)?\b/i.test(t)) {
    due_time = "09:00";
  }

  return { due_date, due_time };
}

function parseTimeFromNaturalLanguage(text: string): { h: number; m: number } | null {
  const ampm = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const ap = ampm[3].toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || m > 59) return null;
    return { h, m };
  }
  const ampm2 = text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (ampm2 && !text.includes(":")) {
    let h = Number(ampm2[1]);
    const ap = ampm2[2].toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23) return null;
    return { h, m: 0 };
  }
  const twentyFour = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (twentyFour) {
    const h = Number(twentyFour[1]);
    const m = Number(twentyFour[2]);
    if (h > 23 || m > 59) return null;
    if (/\b(pm|afternoon|evening)\b/i.test(text) && h <= 11 && !/\bam\b/i.test(text)) {
      return { h: h + 12, m };
    }
    return { h, m };
  }
  return null;
}

export type ResolveExtractionScheduleInput = {
  title: string;
  aiDueDate: string | null;
  aiDueTime: string | null;
  defaultYmd: string;
  timeZone: string;
  /** Use sequential calendar slots when due is "today" and no explicit time. */
  allowCalendarSlots: boolean;
};

export type ResolveExtractionScheduleResult = {
  due_date: string;
  due_time: string;
  /** When true, caller should replace due_time with assignSequentialDueTimesForToday[i]. */
  useCalendarSlot: boolean;
};

/**
 * Merge AI fields + title NLP so Watch List / calendar / timeline share one due_date + due_time.
 * Title wins for relative phrases ("tomorrow", weekday names) when the model omitted or mis-set dates.
 */
export function resolveExtractionSchedule(input: ResolveExtractionScheduleInput): ResolveExtractionScheduleResult {
  const { title, aiDueDate, aiDueTime, defaultYmd, timeZone, allowCalendarSlots } = input;
  const parsed = parseNaturalScheduleFromTitle(title, defaultYmd, timeZone);

  let due_date = defaultYmd;
  if (parsed.due_date) {
    due_date = parsed.due_date;
  } else if (aiDueDate && /^\d{4}-\d{2}-\d{2}$/.test(aiDueDate)) {
    due_date = aiDueDate;
  }

  const aiTime = aiDueTime && /^\d{2}:\d{2}/.test(aiDueTime) ? aiDueTime.slice(0, 5) : null;
  let due_time = aiTime ?? parsed.due_time ?? null;

  const explicitTime = !!(aiTime || parsed.due_time);

  let useCalendarSlot = false;
  if (!explicitTime && due_date === defaultYmd && allowCalendarSlots) {
    useCalendarSlot = true;
    due_time = "09:00";
  } else if (!due_time) {
    due_time = "09:00";
  }

  return { due_date, due_time, useCalendarSlot };
}
