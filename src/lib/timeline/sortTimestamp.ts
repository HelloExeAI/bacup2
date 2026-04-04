/** Stable sort key for mixed ISO date / dateTime strings (local all-day YYYY-MM-DD). */
export function timelineSortKey(start: string | null): number {
  if (!start) return Number.MAX_SAFE_INTEGER;
  if (!start.includes("T")) {
    const t = new Date(`${start}T00:00:00`).getTime();
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  }
  const t = new Date(start).getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}
