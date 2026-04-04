import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  const maxResults = Math.min(100, Math.max(1, Number(searchParams.get("maxResults")) || 20));

  const timeMin =
    searchParams.get("timeMin")?.trim() || new Date().toISOString();
  const timeMax =
    searchParams.get("timeMax")?.trim() ||
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { accessToken } = await getValidGoogleAccessToken(supabase, user.id, accountId);

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", String(maxResults));

    const calRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const calJson = (await calRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!calRes.ok) {
      console.warn("[google/calendar-events]", calRes.status, calJson);
      return NextResponse.json(
        { error: "calendar_failed", detail: calJson },
        { status: calRes.status >= 400 && calRes.status < 600 ? calRes.status : 502 },
      );
    }

    const items = Array.isArray(calJson?.items) ? calJson.items : [];
    const events = items.map((item) => {
      const ev = item as Record<string, unknown>;
      const start = ev.start as { dateTime?: string; date?: string } | undefined;
      const end = ev.end as { dateTime?: string; date?: string } | undefined;
      const rawAtt = ev.attendees;
      const attendees = Array.isArray(rawAtt)
        ? rawAtt
            .filter((a) => a && typeof a === "object" && !(a as { resource?: boolean }).resource)
            .slice(0, 8)
            .map((a) => {
              const x = a as {
                displayName?: string;
                email?: string;
                responseStatus?: string;
              };
              const label = (x.displayName?.trim() || x.email?.split("@")[0] || "?").trim();
              const initials = label
                .split(/\s+/)
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              return {
                initials: initials || "?",
                responseStatus: typeof x.responseStatus === "string" ? x.responseStatus : undefined,
              };
            })
        : [];
      return {
        id: typeof ev.id === "string" ? ev.id : "",
        summary: typeof ev.summary === "string" ? ev.summary : "(no title)",
        htmlLink: typeof ev.htmlLink === "string" ? ev.htmlLink : null,
        location: typeof ev.location === "string" ? ev.location : null,
        start: start?.dateTime ?? start?.date ?? null,
        end: end?.dateTime ?? end?.date ?? null,
        attendees,
      };
    });

    return NextResponse.json({ events });
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("[google/calendar-events]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
