/** Round timestamp up to the next 15-minute boundary (local time). */
export function roundUpToNextQuarterHourMs(ms: number): number {
  const d = new Date(ms);
  let m = d.getMinutes();
  m = Math.ceil(m / 15) * 15;
  if (m >= 60) {
    d.setHours(d.getHours() + 1);
    m = 0;
  }
  d.setMinutes(m, 0, 0);
  d.setSeconds(0, 0);
  return d.getTime();
}

/** Next 15-minute boundary from now, as HH:MM (24h) in local time. */
export function defaultDueTimeQuarterHour(): string {
  const ms = roundUpToNextQuarterHourMs(Date.now());
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
