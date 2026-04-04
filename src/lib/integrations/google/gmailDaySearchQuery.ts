const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Gmail messages.list `q` filter: received on this calendar day.
 * Gmail applies after/before using the mailbox’s timezone settings.
 */
export function gmailSearchQueryForCalendarDay(ymd: string): string | null {
  if (!YMD_RE.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const by = next.getUTCFullYear();
  const bm = next.getUTCMonth() + 1;
  const bd = next.getUTCDate();
  return `after:${y}/${m}/${d} before:${by}/${bm}/${bd}`;
}
