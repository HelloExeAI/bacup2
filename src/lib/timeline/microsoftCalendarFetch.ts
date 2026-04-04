export type MicrosoftCalendarEventRow = {
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

function initialsFromGraphName(name: string | undefined, email: string | undefined): string {
  const label = (name?.trim() || email?.split("@")[0] || "?").trim();
  const initials = label
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "?";
}

function graphStartEnd(ev: Record<string, unknown>): { start: string | null; end: string | null } {
  const s = ev.start as { dateTime?: string; date?: string } | undefined;
  const e = ev.end as { dateTime?: string; date?: string } | undefined;
  if (s?.date) return { start: s.date, end: e?.date ?? null };
  if (s?.dateTime) {
    const startIso = new Date(s.dateTime).toISOString();
    const endIso = e?.dateTime ? new Date(e.dateTime).toISOString() : null;
    return { start: startIso, end: endIso };
  }
  return { start: null, end: null };
}

function mapGraphEvent(ev: Record<string, unknown>): MicrosoftCalendarEventRow {
  const rawAtt = ev.attendees as unknown[] | undefined;
  const attendees = Array.isArray(rawAtt)
    ? rawAtt
        .slice(0, 8)
        .map((a) => {
          const x = a as {
            emailAddress?: { name?: string; address?: string };
            status?: { response?: string };
          };
          const name = x.emailAddress?.name;
          const addr = x.emailAddress?.address;
          const initials = initialsFromGraphName(name, addr);
          const rs = x.status?.response;
          return {
            initials,
            responseStatus:
              rs === "accepted" || rs === "declined" || rs === "tentative" ? rs : undefined,
            name: typeof name === "string" ? name : undefined,
            email: typeof addr === "string" ? addr : undefined,
          };
        })
    : [];
  const { start, end } = graphStartEnd(ev);

  const startTz = (() => {
    const s = ev.start as { timeZone?: string } | undefined;
    return typeof s?.timeZone === "string" ? s.timeZone : null;
  })();
  const endTz = (() => {
    const e = ev.end as { timeZone?: string } | undefined;
    return typeof e?.timeZone === "string" ? e.timeZone : null;
  })();
  const timeZone = startTz ?? endTz ?? null;

  const description = (() => {
    if (typeof ev.bodyPreview === "string") return ev.bodyPreview;
    const body = ev.body as { content?: unknown } | undefined;
    const content = body?.content;
    return typeof content === "string" ? content : null;
  })();

  const location = (() => {
    const loc = ev.location as unknown;
    if (!loc || typeof loc !== "object") return null;
    const anyLoc = loc as Record<string, unknown>;
    if (typeof anyLoc.displayName === "string") return anyLoc.displayName;
    const addr = anyLoc.address as unknown;
    if (addr && typeof addr === "object") {
      const anyAddr = addr as Record<string, unknown>;
      if (typeof anyAddr.city === "string") return anyAddr.city;
    }
    return null;
  })();

  const joinUrl = (() => {
    const om = ev.onlineMeeting as { joinUrl?: string; joinWebUrl?: string } | undefined;
    if (!om) return null;
    if (typeof om.joinUrl === "string" && om.joinUrl.trim()) return om.joinUrl.trim();
    if (typeof om.joinWebUrl === "string" && om.joinWebUrl.trim()) return om.joinWebUrl.trim();
    return null;
  })();
  const meetingLinks = joinUrl ? [{ url: joinUrl, label: "Join" }] : [];

  return {
    id: typeof ev.id === "string" ? ev.id : "",
    summary: typeof ev.subject === "string" ? ev.subject : "(no title)",
    htmlLink: typeof ev.webLink === "string" ? ev.webLink : null,
    start,
    end,
    description,
    location,
    timeZone,
    meetingLinks,
    attendees,
  };
}

export async function fetchMicrosoftTimelineEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<MicrosoftCalendarEventRow[]> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", timeMin);
  url.searchParams.set("endDateTime", timeMax);
  url.searchParams.set("$top", "100");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="UTC"',
    },
  });
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    console.warn("[microsoft/calendarView]", res.status, j);
    return [];
  }
  const values = Array.isArray(j?.value) ? j.value : [];
  return values.map((item) => mapGraphEvent(item as Record<string, unknown>));
}
