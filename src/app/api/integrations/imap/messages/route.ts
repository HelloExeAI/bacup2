import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDecryptedImapSession } from "@/lib/integrations/imap/imapConfig";
import { fetchImapRecentMessages } from "@/lib/integrations/imap/imapMailbox";

export const dynamic = "force-dynamic";

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
  const accountId = searchParams.get("accountId")?.trim();
  const maxResults = Math.min(25, Math.max(1, Number(searchParams.get("maxResults")) || 12));
  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  try {
    const session = await getDecryptedImapSession(supabase, user.id, accountId);
    const messages = await fetchImapRecentMessages(session, maxResults);
    return NextResponse.json({ messages, accountEmail: session.accountEmail });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    console.error("[imap/messages]", e);
    return NextResponse.json({ error: "imap_fetch_failed", message: msg }, { status: 502 });
  }
}
