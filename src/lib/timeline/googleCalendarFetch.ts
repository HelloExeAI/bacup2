type RawAtt = { displayName?: string; email?: string; responseStatus?: string };

function attendeeToTimelineAttendee(a: RawAtt): {
  initials: string;
  responseStatus?: string;
  name?: string;
  email?: string;
} {
  const name = typeof a.displayName === "string" ? a.displayName.trim() : undefined;
  const email = typeof a.email === "string" ? a.email.trim() : undefined;
  const label = (name || email?.split("@")[0] || "?").trim();
  const initials = label
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return {
    initials: initials || "?",
    responseStatus: typeof a.responseStatus === "string" ? a.responseStatus : undefined,
    name,
    email,
  };
}

export type GoogleCalendarEventRow = {
  id: string;
  summary: string;
  htmlLink: string | null;
  start: string | null;
  end: string | null;
  description: string | null;
  location: string | null;
  timeZone: string | null;
  meetingLinks: { url: string; label?: string }[];
  attendees: { initials: string; responseStatus?: string; name?: string; email?: string }[];
};

function mapGoogleItem(item: Record<string, unknown>): GoogleCalendarEventRow {
  const ev = item;
  const start = ev.start as { dateTime?: string; date?: string; timeZone?: string } | undefined;
  const end = ev.end as { dateTime?: string; date?: string; timeZone?: string } | undefined;
  const rawAtt = ev.attendees;
  const attendees = Array.isArray(rawAtt)
    ? rawAtt
        .filter((a) => a && typeof a === "object" && !(a as { resource?: boolean }).resource)
        .slice(0, 8)
        .map((a) => attendeeToTimelineAttendee(a as RawAtt))
    : [];
  const description = typeof ev.description === "string" ? ev.description : null;
  const location = typeof ev.location === "string" ? ev.location : null;
  const timeZone = typeof start?.timeZone === "string" ? start.timeZone : typeof end?.timeZone === "string" ? end.timeZone : null;

  const meetingLinks: { url: string; label?: string }[] = [];
  if (typeof ev.hangoutLink === "string" && ev.hangoutLink.trim()) {
    meetingLinks.push({ url: ev.hangoutLink.trim(), label: "Join" });
  }
  const conf = ev.conferenceData as
    | { entryPoints?: { uri?: string; label?: string }[] }
    | undefined;
  const eps = Array.isArray(conf?.entryPoints) ? conf!.entryPoints : [];
  for (const ep of eps) {
    if (!ep?.uri || typeof ep.uri !== "string") continue;
    const uri = ep.uri.trim();
    if (!uri) continue;
    meetingLinks.push({ url: uri, label: ep.label });
  }

  const seen = new Set<string>();
  const dedupedMeetingLinks = meetingLinks.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  return {
    id: typeof ev.id === "string" ? ev.id : "",
    summary: typeof ev.summary === "string" ? ev.summary : "(no title)",
    htmlLink: typeof ev.htmlLink === "string" ? ev.htmlLink : null,
    start: start?.dateTime ?? start?.date ?? null,
    end: end?.dateTime ?? end?.date ?? null,
    description,
    location,
    timeZone,
    meetingLinks: dedupedMeetingLinks,
    attendees,
  };
}

async function fetchOneGoogleCalendar(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  maxResults: number,
): Promise<GoogleCalendarEventRow[]> {
  const path = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const url = new URL(path);
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
    return [];
  }
  const items = Array.isArray(calJson?.items) ? calJson.items : [];
  return items.map((item) => mapGoogleItem(item as Record<string, unknown>));
}

/** Google Contacts birthdays & device birthdays (yearly recurring). */
export const GOOGLE_BIRTHDAYS_CALENDAR_ID = "addressbook#contacts@group.v.calendar.google.com";

export async function fetchGoogleTimelineEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
  maxResultsPerCalendar: number,
): Promise<GoogleCalendarEventRow[]> {
  const primary = await fetchOneGoogleCalendar(accessToken, "primary", timeMin, timeMax, maxResultsPerCalendar);
  const birthdays = await fetchOneGoogleCalendar(
    accessToken,
    GOOGLE_BIRTHDAYS_CALENDAR_ID,
    timeMin,
    timeMax,
    maxResultsPerCalendar,
  );

  const seen = new Set<string>();
  const out: GoogleCalendarEventRow[] = [];
  for (const ev of [...primary, ...birthdays]) {
    const k = `${ev.id}:${ev.start ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(ev);
  }
  return out;
}
