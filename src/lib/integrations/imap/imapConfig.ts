import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptSecret } from "@/lib/integrations/imap/secretCrypto";
import { getTrustedDbClient } from "@/lib/supabase/service";

export type ImapStoredConfigV1 = {
  v: 1;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  username: string;
  passwordEnc: string;
  /** Optional CalDAV root URL for calendar sync (same password as IMAP in most providers). */
  caldavUrl?: string | null;
};

export type DecryptedImapSession = {
  accountId: string;
  accountEmail: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  username: string;
  password: string;
  caldavUrl: string | null;
};

export function parseImapConfig(raw: unknown): ImapStoredConfigV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.imapHost !== "string" || !o.imapHost.trim()) return null;
  if (typeof o.imapPort !== "number" || !Number.isFinite(o.imapPort)) return null;
  if (typeof o.imapSecure !== "boolean") return null;
  if (typeof o.username !== "string" || !o.username.trim()) return null;
  if (typeof o.passwordEnc !== "string" || !o.passwordEnc.trim()) return null;
  const caldavUrl = o.caldavUrl === null || o.caldavUrl === undefined ? null : String(o.caldavUrl).trim() || null;
  return {
    v: 1,
    imapHost: o.imapHost.trim(),
    imapPort: o.imapPort,
    imapSecure: o.imapSecure,
    username: o.username.trim(),
    passwordEnc: o.passwordEnc.trim(),
    caldavUrl,
  };
}

export async function getDecryptedImapSession(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<DecryptedImapSession> {
  const db = getTrustedDbClient(supabase);
  const { data: row, error } = await db
    .from("user_connected_accounts")
    .select("id, account_email, provider, imap_config")
    .eq("user_id", userId)
    .eq("id", accountId)
    .eq("provider", "imap")
    .maybeSingle();

  if (error) throw error;
  if (!row) throw new Error("IMAP account not found");

  const cfg = parseImapConfig(row.imap_config);
  if (!cfg) throw new Error("Invalid IMAP configuration");

  const password = decryptSecret(cfg.passwordEnc);

  return {
    accountId: row.id,
    accountEmail: row.account_email,
    imapHost: cfg.imapHost,
    imapPort: cfg.imapPort,
    imapSecure: cfg.imapSecure,
    username: cfg.username,
    password,
    caldavUrl: cfg.caldavUrl ?? null,
  };
}
