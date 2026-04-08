import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encryptSecret, isImapEncryptionConfigured } from "@/lib/integrations/imap/secretCrypto";
import type { ImapStoredConfigV1 } from "@/lib/integrations/imap/imapConfig";
import { getTrustedDbClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email(),
  imapHost: z.string().trim().min(1).max(253),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  imapSecure: z.boolean().default(true),
  username: z.string().trim().min(1).max(320).optional(),
  password: z.string().min(1).max(500),
  caldavUrl: z.union([z.string().url().max(2000), z.literal("")]).optional(),
});

async function testImapConnection(params: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}) {
  const client = new ImapFlow({
    host: params.host,
    port: params.port,
    secure: params.secure,
    auth: { user: params.user, pass: params.pass },
    logger: false,
  });
  await client.connect();
  try {
    await client.mailboxOpen("INBOX");
  } finally {
    await client.logout();
  }
}

export async function POST(req: Request) {
  if (!isImapEncryptionConfigured()) {
    return NextResponse.json(
      { error: "Server missing BACUP_IMAP_ENCRYPTION_SECRET — add it in Vercel env to connect IMAP." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { email, imapHost, imapPort, imapSecure, password } = parsed.data;
  const username = parsed.data.username?.trim() || email.trim().toLowerCase();
  const caldavUrl =
    parsed.data.caldavUrl && parsed.data.caldavUrl.trim() ? parsed.data.caldavUrl.trim() : null;

  try {
    await testImapConnection({
      host: imapHost,
      port: imapPort,
      secure: imapSecure,
      user: username,
      pass: password,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "IMAP connection failed";
    return NextResponse.json({ error: "imap_test_failed", message: msg }, { status: 400 });
  }

  const passwordEnc = encryptSecret(password);
  const cfg: ImapStoredConfigV1 = {
    v: 1,
    imapHost,
    imapPort,
    imapSecure,
    username,
    passwordEnc,
    caldavUrl,
  };

  const db = getTrustedDbClient(supabase);
  const row = {
    user_id: user.id,
    provider: "imap" as const,
    account_email: email.trim().toLowerCase(),
    provider_subject: email.trim().toLowerCase(),
    access_token: null as string | null,
    refresh_token: null as string | null,
    token_expires_at: null as string | null,
    scopes: caldavUrl ? "imap+caldav" : "imap",
    imap_config: cfg as unknown as Record<string, unknown>,
  };

  const { data: existing } = await db
    .from("user_connected_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "imap")
    .eq("account_email", row.account_email)
    .maybeSingle();

  if (existing?.id) {
    const { error: upErr } = await db
      .from("user_connected_accounts")
      .update({
        provider_subject: row.provider_subject,
        scopes: row.scopes,
        imap_config: cfg as unknown as Record<string, unknown>,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
      })
      .eq("id", existing.id)
      .eq("user_id", user.id);
    if (upErr) throw upErr;
    return NextResponse.json({ ok: true, id: existing.id, updated: true });
  }

  const { data: ins, error: insErr } = await db.from("user_connected_accounts").insert(row).select("id").single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message, code: insErr.code }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: ins?.id, updated: false });
}
