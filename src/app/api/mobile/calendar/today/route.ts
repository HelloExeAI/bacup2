import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";
import { getValidGoogleAccessToken, GoogleIntegrationError } from "@/lib/integrations/google/googleAccessToken";
import { getValidMicrosoftAccessToken, MicrosoftIntegrationError } from "@/lib/integrations/microsoft/microsoftAccessToken";
import { fetchGoogleTimelineEvents } from "@/lib/timeline/googleCalendarFetch";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accountId: z.string().uuid().optional(),
  maxResults: z.coerce.number().int().min(1).max(250).optional(),
  tzOffsetMinutes: z.coerce.number().int().min(-24 * 60).max(24 * 60).optional(),
});

function dayBoundsIsoForDeviceLocalDay(ymd: string, tzOffsetMinutes: number): { timeMin: string; timeMax: string } {
  // tzOffsetMinutes matches JS Date.getTimezoneOffset():
  // minutes to add to local time to get UTC (e.g. IST = -330).
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const localStartMs = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  const localEndMs = Date.UTC(y, (m || 1) - 1, (d || 1) + 1, 0, 0, 0, 0);
  const start = new Date(localStartMs + tzOffsetMinutes * 60 * 1000);
  const end = new Date(localEndMs + tzOffsetMinutes * 60 * 1000);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

function hhmmFromIsoOrDate(raw: string | null): string | null {
  if (!raw) return null;
  // All-day events come as YYYY-MM-DD; timed as ISO.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const i = raw.indexOf("T");
  if (i < 0) return null;
  const after = raw.slice(i + 1);
  const m = after.match(/^(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

async function fetchMicrosoftCalendarView(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string,
  maxResults: number,
): Promise<Array<{ id: string; subject: string; startIso: string | null }>> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", timeMinIso);
  url.searchParams.set("endDateTime", timeMaxIso);
  url.searchParams.set("$top", String(Math.min(100, Math.max(1, maxResults))));
  url.searchParams.set("$select", "id,subject,start,end,isAllDay");
  url.searchParams.set("$orderby", "start/dateTime");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json().catch(() => null)) as any;
  if (!res.ok) return [];
  const rows = Array.isArray(j?.value) ? j.value : [];
  return rows
    .map((r: any) => {
      const id = String(r?.id ?? "").trim();
      const subject = String(r?.subject ?? "").trim() || "(no title)";
      const startIso = typeof r?.start?.dateTime === "string" ? String(r.start.dateTime) : null;
      return { id, subject, startIso };
    })
    .filter((r: any) => r.id);
}

export async function GET(req: Request) {
  const supabase = supabaseFromBearer(req);
  if (!supabase) return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    date: searchParams.get("date") ?? undefined,
    accountId: searchParams.get("accountId") ?? undefined,
    maxResults: searchParams.get("maxResults") ?? undefined,
    tzOffsetMinutes: searchParams.get("tzOffsetMinutes") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);
  const tzOffsetMinutes = parsed.data.tzOffsetMinutes ?? 0;
  const { timeMin, timeMax } = dayBoundsIsoForDeviceLocalDay(date, tzOffsetMinutes);
  const maxResults = parsed.data.maxResults ?? 80;

  try {
    const out: Array<{ id: string; title: string; time: string | null; provider: "google" | "microsoft" }> = [];

    // Google (if connected)
    try {
      const { accessToken } = await getValidGoogleAccessToken(supabase, user.id, parsed.data.accountId);
      const rows = await fetchGoogleTimelineEvents(accessToken, timeMin, timeMax, Math.min(120, maxResults));
      for (const e of rows.slice(0, maxResults)) {
        out.push({
          id: `google:${e.id}`,
          title: e.summary,
          time: hhmmFromIsoOrDate(e.start),
          provider: "google",
        });
      }
    } catch (e) {
      // ignore when not connected; surface other errors below.
      if (!(e instanceof GoogleIntegrationError && e.code === "not_connected")) throw e;
    }

    // Microsoft (if connected)
    try {
      const { accessToken } = await getValidMicrosoftAccessToken(supabase, user.id, parsed.data.accountId);
      const rows = await fetchMicrosoftCalendarView(accessToken, timeMin, timeMax, maxResults);
      for (const e of rows.slice(0, maxResults)) {
        out.push({
          id: `microsoft:${e.id}`,
          title: e.subject,
          time: hhmmFromIsoOrDate(e.startIso),
          provider: "microsoft",
        });
      }
    } catch (e) {
      if (!(e instanceof MicrosoftIntegrationError && e.code === "not_connected")) throw e;
    }

    return NextResponse.json({ date, events: out });
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    if (e instanceof MicrosoftIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("[mobile/calendar/today]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

