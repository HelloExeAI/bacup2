import { ImapFlow } from "imapflow";

import type { DecryptedImapSession } from "@/lib/integrations/imap/imapConfig";

export type ImapMessageRow = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  provider: "imap";
  accountEmail: string;
};

export async function fetchImapRecentMessages(
  session: DecryptedImapSession,
  maxResults: number,
): Promise<ImapMessageRow[]> {
  const client = new ImapFlow({
    host: session.imapHost,
    port: session.imapPort,
    secure: session.imapSecure,
    auth: { user: session.username, pass: session.password },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uidsRaw = await client.search({ all: true });
      const uids = Array.isArray(uidsRaw) ? uidsRaw : [];
      const take = uids.slice(Math.max(0, uids.length - Math.min(50, maxResults)));
      if (take.length === 0) return [];

      const out: ImapMessageRow[] = [];
      for await (const msg of client.fetch(take, { envelope: true, internalDate: true, uid: true })) {
        const env = msg.envelope;
        const subject = typeof env?.subject === "string" ? env.subject.trim() : "(no subject)";
        const f = env?.from?.[0];
        const from =
          f && typeof f === "object"
            ? [f.name, f.address].filter(Boolean).join(" ").trim() || String(f.address ?? "?")
            : "?";
        const date =
          msg.internalDate instanceof Date
            ? msg.internalDate.toISOString()
            : new Date().toISOString();
        const snippet = "";
        out.push({
          id: String(msg.uid),
          subject,
          from,
          date,
          snippet,
          provider: "imap",
          accountEmail: session.accountEmail,
        });
      }
      return out.reverse();
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
