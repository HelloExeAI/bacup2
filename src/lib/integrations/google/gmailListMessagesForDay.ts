import { gmailSearchQueryForCalendarDay } from "@/lib/integrations/google/gmailDaySearchQuery";

type GmailHeader = { name?: string; value?: string };

function headerMap(headers: GmailHeader[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const h of headers ?? []) {
    const n = h.name?.toLowerCase();
    if (n && h.value) m[n] = h.value;
  }
  return m;
}

export type GmailListMessageRow = {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  error?: boolean;
};

/**
 * Lists Gmail messages for a calendar day (inbox or sent), using Gmail `q` syntax.
 */
export async function fetchGmailInboxMessagesForDay(
  accessToken: string,
  opts: { dateYmd: string; folder?: "inbox" | "sent"; maxResults?: number },
): Promise<GmailListMessageRow[]> {
  const dayQuery = gmailSearchQueryForCalendarDay(opts.dateYmd);
  if (!dayQuery) return [];

  const maxResults = Math.min(50, Math.max(1, opts.maxResults ?? 25));
  const folderRaw = (opts.folder ?? "inbox").trim().toLowerCase();
  const label = folderRaw === "sent" ? "in:sent" : "in:inbox";
  const listQ = `${label} ${dayQuery}`.trim();

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(maxResults));
  listUrl.searchParams.set("q", listQ);

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listJson = (await listRes.json().catch(() => null)) as Record<string, unknown> | null;
  if (!listRes.ok) {
    console.warn("[gmailListMessagesForDay] list", listRes.status, listJson);
    return [];
  }

  const raw = listJson?.messages;
  const ids = Array.isArray(raw)
    ? (raw as { id?: unknown }[])
        .map((m) => (typeof m?.id === "string" ? m.id : null))
        .filter((x): x is string => x !== null)
    : [];

  const messages = await Promise.all(
    ids.map(async (id) => {
      const metaUrl = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`,
      );
      metaUrl.searchParams.set("format", "metadata");
      metaUrl.searchParams.append("metadataHeaders", "Subject");
      metaUrl.searchParams.append("metadataHeaders", "From");
      metaUrl.searchParams.append("metadataHeaders", "Date");

      const mRes = await fetch(metaUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const mJson = (await mRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (!mRes.ok) {
        return { id, subject: "(no subject)", from: "", date: "", snippet: "", error: true as const };
      }
      const payload = mJson?.payload as { headers?: GmailHeader[] } | undefined;
      const h = headerMap(payload?.headers);
      return {
        id,
        threadId: typeof mJson?.threadId === "string" ? mJson.threadId : undefined,
        subject: h.subject ?? "(no subject)",
        from: h.from ?? "",
        date: h.date ?? "",
        snippet: typeof mJson?.snippet === "string" ? mJson.snippet : "",
      };
    }),
  );

  return messages;
}
