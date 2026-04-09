import {
  extractTextFromPayload,
  headerMap,
  parseEmailFromFromHeader,
  type GmailApiPart,
} from "@/lib/integrations/google/gmailMessageParse";

export type ThreadMessageLite = {
  id: string;
  internalMs: number;
  fromRaw: string;
  fromEmail: string;
  text: string;
};

type GmailThreadJson = {
  messages?: Array<{
    id?: string;
    internalDate?: string;
    payload?: GmailApiPart & { headers?: { name?: string; value?: string }[] };
  }>;
};

export async function fetchGmailThreadMessages(accessToken: string, threadId: string): Promise<ThreadMessageLite[]> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`,
  );
  url.searchParams.set("format", "full");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json().catch(() => null)) as GmailThreadJson | null;
  if (!res.ok || !j?.messages?.length) {
    return [];
  }

  const out: ThreadMessageLite[] = [];
  for (const m of j.messages) {
    const id = typeof m.id === "string" ? m.id : "";
    if (!id) continue;
    const internalMs = Number(m.internalDate);
    const headers = headerMap(m.payload?.headers);
    const fromRaw = headers["from"] ?? headers["sender"] ?? "";
    const fromEmail = parseEmailFromFromHeader(fromRaw).toLowerCase();
    const { text } = extractTextFromPayload(m.payload);
    const snip =
      typeof (m as { snippet?: string }).snippet === "string" ? String((m as { snippet: string }).snippet) : "";
    out.push({
      id,
      internalMs: Number.isFinite(internalMs) ? internalMs : 0,
      fromRaw,
      fromEmail,
      text: text.trim() || snip,
    });
  }

  out.sort((a, b) => a.internalMs - b.internalMs);
  return out;
}
