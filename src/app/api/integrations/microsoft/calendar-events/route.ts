import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getValidMicrosoftAccessToken,
  MicrosoftIntegrationError,
} from "@/lib/integrations/microsoft/microsoftAccessToken";

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

/** Create an event in the signed-in Microsoft 365 calendar (optionally as a Teams meeting). */
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
    const { accessToken } = await getValidMicrosoftAccessToken(supabase, user.id, b.accountId ?? undefined);

    const startHm = normalizeHhmm(b.startTime);
    const endHm = normalizeHhmm(b.endTime);
    const endDay = (b.endDate ?? b.startDate).trim();
    const startDt = `${b.startDate}T${startHm}:00`;
    const endDt = `${endDay}T${endHm}:00`;

    let desc = (b.description ?? "").trim();
    if (link) {
      desc = desc ? `${desc}\n\nMeeting link: ${link}` : `Meeting link: ${link}`;
    }

    const payload: Record<string, unknown> = {
      subject: b.title.trim(),
      body: {
        contentType: "text",
        content: desc || " ",
      },
      start: { dateTime: startDt, timeZone: b.timeZone },
      end: { dateTime: endDt, timeZone: b.timeZone },
    };

    const loc = (b.location ?? "").trim();
    if (loc) {
      payload.location = { displayName: loc };
    }

    if (b.attendees?.length) {
      payload.attendees = b.attendees.map((email) => ({
        emailAddress: { address: email, name: email.split("@")[0] ?? email },
        type: "required",
      }));
    }

    if (b.addVideoCall) {
      payload.isOnlineMeeting = true;
      payload.onlineMeetingProvider = "teamsForBusiness";
    }

    const calRes = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const calJson = (await calRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!calRes.ok) {
      console.warn("[microsoft/calendar-events POST]", calRes.status, calJson);
      return NextResponse.json(
        { error: "calendar_create_failed", detail: calJson },
        { status: calRes.status >= 400 && calRes.status < 600 ? calRes.status : 502 },
      );
    }

    const id = typeof calJson?.id === "string" ? calJson.id : "";
    const webLink = typeof calJson?.webLink === "string" ? calJson.webLink : null;
    return NextResponse.json({ ok: true, id, webLink });
  } catch (e) {
    if (e instanceof MicrosoftIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("[microsoft/calendar-events POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
