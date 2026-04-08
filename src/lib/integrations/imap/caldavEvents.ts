import { createDAVClient } from "tsdav";

import type { DecryptedImapSession } from "@/lib/integrations/imap/imapConfig";

export type ImapCalendarEventRow = {
  id: string;
  summary: string;
  htmlLink: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  provider: "imap";
  accountEmail: string;
};

/** Best-effort ISO from ICS date lines (UTC Z or floating). */
function icsDateToIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(s);
  if (m) {
    return new Date(
      Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]),
    ).toISOString();
  }
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (d) {
    return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], 12, 0, 0)).toISOString();
  }
  return null;
}

function parseVevent(ics: string): { uid: string; summary: string; start: string | null; end: string | null; location: string | null } | null {
  const block = ics.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i)?.[1];
  if (!block) return null;
  const uid = block.match(/UID:([^\r\n]+)/i)?.[1]?.trim() ?? `im-${Math.random().toString(36).slice(2)}`;
  const summary = block.match(/SUMMARY[^:]*:([^\r\n]+)/i)?.[1]?.trim() ?? "(no title)";
  const loc = block.match(/LOCATION[^:]*:([^\r\n]+)/i)?.[1]?.trim() ?? null;
  const ds = block.match(/DTSTART[^:]*:([^\r\n]+)/i)?.[1]?.trim();
  const de = block.match(/DTEND[^:]*:([^\r\n]+)/i)?.[1]?.trim();
  return {
    uid,
    summary,
    start: icsDateToIso(ds),
    end: icsDateToIso(de),
    location: loc,
  };
}

export async function fetchCalDavEventsForSession(
  session: DecryptedImapSession,
  timeMin: string,
  timeMax: string,
): Promise<ImapCalendarEventRow[]> {
  if (!session.caldavUrl?.trim()) return [];

  const client = await createDAVClient({
    serverUrl: session.caldavUrl.replace(/\/$/, ""),
    credentials: { username: session.username, password: session.password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });

  const calendars = await client.fetchCalendars();
  if (!Array.isArray(calendars) || calendars.length === 0) return [];

  const out: ImapCalendarEventRow[] = [];
  for (const cal of calendars) {
    const objs = await client.fetchCalendarObjects({
      calendar: cal,
      timeRange: { start: timeMin, end: timeMax },
    });
    for (const o of objs ?? []) {
      const raw = typeof o.data === "string" ? o.data : "";
      if (!raw) continue;
      const ev = parseVevent(raw);
      if (!ev?.start) continue;
      out.push({
        id: `${session.accountId}:${ev.uid}`,
        summary: ev.summary,
        htmlLink: null,
        location: ev.location,
        start: ev.start,
        end: ev.end,
        provider: "imap",
        accountEmail: session.accountEmail,
      });
    }
  }

  out.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return out;
}
