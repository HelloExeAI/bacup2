/** Parse YYYY-MM-DD as local calendar date (no TZ shift). */
export function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [a, b, c] = ymd.split("-").map((x) => Number(x));
  return { y: a, m: b, d: c };
}

export function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Compare YYYY-MM-DD strings lexicographically (valid for same calendar system). */
export function ymdCompare(a: string, b: string): number {
  return a.localeCompare(b);
}

export function addDaysYmd(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** Add calendar months; clamps day to last day of target month. */
export function addMonthsYmd(ymd: string, months: number): string {
  const { y, m, d } = parseYmd(ymd);
  const target = new Date(y, m - 1 + months, 1);
  const yy = target.getFullYear();
  const mm = target.getMonth();
  const lastDay = new Date(yy, mm + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return formatYmd(yy, mm + 1, day);
}

/** ISO weekday Mon=1 … Sun=7 from local Y-M-D */
export function isoWeekdayFromYmd(ymd: string): number {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(y, m - 1, d);
  const js = dt.getDay(); // 0 Sun .. 6 Sat
  return js === 0 ? 7 : js;
}
