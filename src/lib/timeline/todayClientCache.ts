import type { TimelineItem } from "@/lib/timeline/types";
import { ymdToday } from "@/modules/tasks/dayBriefing";

export type TodayTimelineConnected = { google: boolean; outlook: boolean };
export type TodayTimelineClientResponse = {
  items: TimelineItem[];
  connected: TodayTimelineConnected;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry = {
  ymd: string | null;
  fetchedAtMs: number;
  data: TodayTimelineClientResponse | null;
  inFlight: Promise<TodayTimelineClientResponse> | null;
};

let entry: CacheEntry = {
  ymd: null,
  fetchedAtMs: 0,
  data: null,
  inFlight: null,
};

export function peekTodayTimelineCache(ttlMs = DEFAULT_TTL_MS): {
  fresh: boolean;
  data: TodayTimelineClientResponse | null;
} {
  const today = ymdToday();
  if (!entry.data || entry.ymd !== today) return { fresh: false, data: null };
  const age = Date.now() - entry.fetchedAtMs;
  return { fresh: age <= ttlMs, data: entry.data };
}

export async function fetchTodayTimelineCached(opts?: { force?: boolean; ttlMs?: number }): Promise<{
  data: TodayTimelineClientResponse;
  cached: boolean;
}> {
  const force = Boolean(opts?.force);
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const today = ymdToday();

  if (!force) {
    const peek = peekTodayTimelineCache(ttlMs);
    if (peek.fresh && peek.data) {
      return { data: peek.data, cached: true };
    }
  }

  if (entry.inFlight && entry.ymd === today && !force) {
    const data = await entry.inFlight;
    return { data, cached: false };
  }

  entry.inFlight = (async () => {
    const res = await fetch("/api/timeline/today", { credentials: "include" });
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const msg = typeof j?.error === "string" ? j?.error : `Timeline fetch failed (${res.status})`;
      throw new Error(msg);
    }

    const list = Array.isArray(j?.items) ? (j?.items as TimelineItem[]) : [];
    const conn = (j?.connected as { google?: boolean; outlook?: boolean } | undefined) ?? undefined;
    const connected: TodayTimelineConnected = {
      google: Boolean(conn?.google),
      outlook: Boolean(conn?.outlook),
    };

    const data: TodayTimelineClientResponse = { items: list, connected };
    entry = { ...entry, ymd: today, fetchedAtMs: Date.now(), data, inFlight: null };
    return data;
  })();

  const data = await entry.inFlight;
  return { data, cached: false };
}

