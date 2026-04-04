/** UTC calendar month key for usage periods, e.g. `2026-04`. */
export function utcPeriodKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** First instant of next UTC month (for “resets on” copy). */
export function nextUtcPeriodStart(d = new Date()): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
}
