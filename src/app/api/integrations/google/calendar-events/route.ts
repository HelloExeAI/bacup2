import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";

export const dynamic = "force-dynamic";

const CreateEventBody = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(8000).optional().nullable(),
    location: z.string().max(2000).optional().nullable(),
    meetingLink: z.string().max(2000).optional().nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
    timeZone: z.string().min(1).max(120),
    attendees: z.array(z.string().email()).max(100).optional(),
    addVideoCall: z.boolean().optional(),
    accountId: z.string().uuid().optional().nullable(),
  })
  .strict();

function normalizeHhmm(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  const h = Math.min(23, Math.max(0, Number(m[1]) || 0));
  const min = Math.min(59, Math.max(0, Number(m[2]) || 0));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

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

/** Create an event on the user's primary Google Calendar (optionally with Google Meet). */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = CreateEventBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const b = parsed.data;
  const link = b.meetingLink?.trim() ?? "";
  if (link && !/^https?:\/\//i.test(link)) {
    return NextResponse.json({ error: "meeting_link_must_be_http_url" }, { status: 400 });
  }

  try {
    const { accessToken } = await getValidGoogleAccessToken(supabase, user.id, b.accountId ?? undefined);

    const startHm = normalizeHhmm(b.startTime);
    const endHm = normalizeHhmm(b.endTime);
    const endDay = (b.endDate ?? b.startDate).trim();
    const startDt = `${b.startDate}T${startHm}:00`;
    const endDt = `${endDay}T${endHm}:00`;

    let desc = (b.description ?? "").trim();
    if (link) {
      desc = desc ? `${desc}\n\nMeeting link: ${link}` : `Meeting link: ${link}`;
    }

    const event: Record<string, unknown> = {
      summary: b.title.trim(),
      start: { dateTime: startDt, timeZone: b.timeZone },
      end: { dateTime: endDt, timeZone: b.timeZone },
    };

    const loc = (b.location ?? "").trim();
    if (loc) event.location = loc;
    if (desc) event.description = desc;

    if (b.attendees?.length) {
      event.attendees = b.attendees.map((email) => ({ email }));
    }

    if (b.addVideoCall) {
      event.conferenceData = {
        createRequest: {
          requestId: randomUUID().replace(/-/g, "").slice(0, 32),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    let url = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    if (b.addVideoCall) {
      url += "?conferenceDataVersion=1";
    }

    const calRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
    const calJson = (await calRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!calRes.ok) {
      console.warn("[google/calendar-events POST]", calRes.status, calJson);
      return NextResponse.json(
        { error: "calendar_create_failed", detail: calJson },
        { status: calRes.status >= 400 && calRes.status < 600 ? calRes.status : 502 },
      );
    }

    const id = typeof calJson?.id === "string" ? calJson.id : "";
    const htmlLink = typeof calJson?.htmlLink === "string" ? calJson.htmlLink : null;
    return NextResponse.json({ ok: true, id, htmlLink });
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("[google/calendar-events POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
