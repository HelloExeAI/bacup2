import type { SupabaseClient } from "@supabase/supabase-js";

import { GoogleIntegrationError, getValidGoogleAccessToken } from "@/lib/integrations/google/googleAccessToken";

import type { IsoDate, NormalizedCalendarRow } from "./types";

function eventStartToUserYmd(start: string | null | undefined, tz: string): string | null {
  if (!start || typeof start !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const ms = Date.parse(start);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: tz });
}

function eventStartToLocalTimeHm(start: string | null | undefined, tz: string): string | null {
  if (!start || typeof start !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const ms = Date.parse(start);
  if (Number.isNaN(ms)) return null;
  const s = new Date(ms).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/**
 * Pull Google primary-calendar instances in a padded UTC window, then keep rows whose local date falls in [inclusiveStart, inclusiveEnd].
 */
export async function fetchGoogleCalendarForBrain(
  supabase: SupabaseClient,
  userId: string,
  params: { timezone: string; inclusiveStart: IsoDate; inclusiveEnd: IsoDate; accountId?: string | null },
): Promise<{ rows: NormalizedCalendarRow[]; notice: string | null }> {
  const { timezone, inclusiveStart, inclusiveEnd } = params;
  let notice: string | null = null;

  const [ys, ms, ds] = inclusiveStart.split("-").map(Number);
  const [ye, me, de] = inclusiveEnd.split("-").map(Number);
  const padMs = 40 * 3600 * 1000;
  const timeMin = new Date(Date.UTC(ys, ms - 1, ds, 0, 0, 0) - padMs).toISOString();
  const timeMax = new Date(Date.UTC(ye, me - 1, de, 23, 59, 59) + padMs).toISOString();

  let accessToken: string;
  let accountEmail: string;
  try {
    const t = await getValidGoogleAccessToken(supabase, userId, params.accountId ?? null);
    accessToken = t.accessToken;
    accountEmail = t.account.account_email;
  } catch (e) {
    if (e instanceof GoogleIntegrationError && e.code === "not_connected") {
      return { rows: [], notice: "Google Calendar not connected for this user." };
    }
    notice = e instanceof Error ? e.message : "Google Calendar token error.";
    return { rows: [], notice };
  }

  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("maxResults", "120");

  const calRes = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const calJson = (await calRes.json().catch(() => null)) as Record<string, unknown> | null;
  if (!calRes.ok) {
    return { rows: [], notice: "Google Calendar API request failed." };
  }

  const items = Array.isArray(calJson?.items) ? calJson.items : [];
  const rows: NormalizedCalendarRow[] = [];

  for (const item of items) {
    const ev = item as Record<string, unknown>;
    const start = ev.start as { dateTime?: string; date?: string } | undefined;
    const rawStart = start?.dateTime ?? start?.date ?? null;
    const ymd = eventStartToUserYmd(rawStart, timezone);
    if (!ymd || ymd < inclusiveStart || ymd > inclusiveEnd) continue;

    const summary = typeof ev.summary === "string" ? ev.summary : "(no title)";
    const isRecurringInstance = Boolean(
      typeof ev.recurringEventId === "string" ||
      (Array.isArray(ev.recurrence) && ev.recurrence.length > 0),
    );
    const timeHm = eventStartToLocalTimeHm(rawStart, timezone);

    rows.push({
      source: "google",
      accountEmail,
      title: summary,
      date: ymd,
      time: timeHm,
      isRecurringInstance,
    });
  }

  rows.sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  return { rows, notice: null };
}
