export type MeetingEndLocal = { ymd: string; hhmm: string };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

/** ISO YYYY-MM-DD lexicographic order matches chronological order. */
function compareYmd(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** HH:MM zero-padded 24h lexicographic order matches chronological order. */
function compareHhmm(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * True if (due_date, due_time) is strictly after (end.ymd, end.hhmm) on the wall clock
 * (no timezone — matches client-provided meeting end parts).
 */
function isWallClockDueAfterEnd(
  dueDate: string,
  dueTime: string,
  end: MeetingEndLocal,
): boolean {
  const c = compareYmd(dueDate, end.ymd);
  if (c < 0) return false;
  if (c > 0) return true;
  return compareHhmm(dueTime, end.hhmm) > 0;
}

/**
 * Next 15-minute boundary strictly after (end.ymd, end.hhmm), using pure Gregorian calendar math
 * so behavior does not depend on the server's local timezone.
 */
export function nextQuarterHourStrictlyAfterWallClock(end: MeetingEndLocal): { ymd: string; hhmm: string } {
  const endAbs = ymdHhmmToAbsoluteMinutes(end.ymd, end.hhmm);
  const nextAbs =
    endAbs % 15 === 0 ? endAbs + 15 : Math.ceil((endAbs + 1) / 15) * 15;
  return absoluteMinutesToYmdHhmm(nextAbs);
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  if (!YMD_RE.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

function parseHhmm(hhmm: string): number | null {
  if (!HHMM_RE.test(hhmm)) return null;
  const [h, mi] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Minutes since an arbitrary Gregorian epoch (JDN 0 day) for stable ordering. */
function ymdHhmmToAbsoluteMinutes(ymd: string, hhmm: string): number {
  const ymdP = parseYmd(ymd);
  const mins = parseHhmm(hhmm);
  if (!ymdP || mins === null) return 0;
  const jdn = gregorianToJdn(ymdP.y, ymdP.m, ymdP.d);
  return jdn * 24 * 60 + mins;
}

function absoluteMinutesToYmdHhmm(abs: number): { ymd: string; hhmm: string } {
  let jdn = Math.floor(abs / (24 * 60));
  let mins = abs % (24 * 60);
  if (mins < 0) {
    mins += 24 * 60;
    jdn -= 1;
  }
  const { y, m, d } = jdnToGregorian(jdn);
  const h = Math.floor(mins / 60);
  const mi = mins % 60;
  return {
    ymd: `${y}-${pad2(m)}-${pad2(d)}`,
    hhmm: `${pad2(h)}:${pad2(mi)}`,
  };
}

function daysInMonth(year: number, month: number): number {
  const md = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return md[month - 1] ?? 0;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Julian day number (integer) at noon UTC for Gregorian calendar date (Fliegel & Van Flandern). */
function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function jdnToGregorian(jdn: number): { y: number; m: number; d: number } {
  let l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  l -= Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const d = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const m = j + 2 - 12 * l;
  const y = 100 * (n - 49) + i + l;
  return { y, m, d };
}

/**
 * Ensures due date/time is valid and on the wall clock strictly after the meeting end.
 */
export function clampDueAfterMeetingEnd(
  dueDate: string | null,
  dueTime: string | null,
  end: MeetingEndLocal,
): { due_date: string; due_time: string } {
  const fallback = (): { due_date: string; due_time: string } => {
    const { ymd, hhmm } = nextQuarterHourStrictlyAfterWallClock(end);
    return { due_date: ymd, due_time: hhmm };
  };

  if (!dueDate || !dueTime || !YMD_RE.test(dueDate) || !HHMM_RE.test(dueTime)) {
    return fallback();
  }
  if (parseYmd(dueDate) === null || parseHhmm(dueTime) === null) {
    return fallback();
  }

  if (!isWallClockDueAfterEnd(dueDate, dueTime, end)) {
    return fallback();
  }

  return { due_date: dueDate, due_time: dueTime };
}
