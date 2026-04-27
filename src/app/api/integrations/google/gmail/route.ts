import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchGmailInboxMessagesForDay } from "@/lib/integrations/google/gmailListMessagesForDay";
import { gmailSearchQueryForCalendarDay } from "@/lib/integrations/google/gmailDaySearchQuery";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";

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
  const accountId = searchParams.get("accountId");
  const maxResults = Math.min(25, Math.max(1, Number(searchParams.get("maxResults")) || 12));
  let dateYmd = searchParams.get("date")?.trim() ?? "";
  if (!dateYmd) {
    const now = new Date();
    dateYmd = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  }
  const dayQuery = gmailSearchQueryForCalendarDay(dateYmd);
  if (!dayQuery) {
    return NextResponse.json({ error: "Invalid date (use YYYY-MM-DD)" }, { status: 400 });
  }

  const folderRaw = (searchParams.get("folder") ?? "inbox").trim().toLowerCase();
  const folder = folderRaw === "sent" ? "sent" : "inbox";

  try {
    const { accessToken } = await getValidGoogleAccessToken(supabase, user.id, accountId);
    const messages = await fetchGmailInboxMessagesForDay(accessToken, {
      dateYmd,
      folder,
      maxResults,
    });

    return NextResponse.json({ messages, date: dateYmd });
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("[google/gmail]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
