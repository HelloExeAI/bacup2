/** ISO bounds for a calendar day in the user's local timezone (for Google Calendar `timeMin` / `timeMax`). */
export function localDayBoundsIso(ymd: string): { timeMin: string; timeMax: string } {
  const parts = ymd.split("-").map((x) => Number(x));
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/** Inclusive range of `days` local calendar days starting at `startYmd` (YYYY-MM-DD). */
export function localRangeBoundsIso(startYmd: string, days: number): { timeMin: string; timeMax: string } {
  const parts = startYmd.split("-").map((x) => Number(x));
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + Math.max(1, days) - 1, 23, 59, 59, 999);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}
