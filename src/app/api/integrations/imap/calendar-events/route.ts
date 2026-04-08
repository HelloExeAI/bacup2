import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDecryptedImapSession } from "@/lib/integrations/imap/imapConfig";
import { fetchCalDavEventsForSession } from "@/lib/integrations/imap/caldavEvents";

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
  const maxResults = Math.min(100, Math.max(1, Number(searchParams.get("maxResults")) || 25));
  const timeMin =
    searchParams.get("timeMin")?.trim() || new Date().toISOString();
  const timeMax =
    searchParams.get("timeMax")?.trim() ||
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  try {
    const session = await getDecryptedImapSession(supabase, user.id, accountId);
    if (!session.caldavUrl?.trim()) {
      return NextResponse.json({ events: [], skipped: "no_caldav_url" });
    }
    const events = await fetchCalDavEventsForSession(session, timeMin, timeMax);
    return NextResponse.json({
      events: events.slice(0, maxResults),
      accountEmail: session.accountEmail,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    console.error("[imap/calendar-events]", e);
    return NextResponse.json({ error: "caldav_failed", message: msg }, { status: 502 });
  }
}
