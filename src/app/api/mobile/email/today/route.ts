import { NextResponse } from "next/server";

import { fetchGmailInboxMessagesForDay } from "@/lib/integrations/google/gmailListMessagesForDay";
import { gmailSearchQueryForCalendarDay } from "@/lib/integrations/google/gmailDaySearchQuery";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";
import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  provider: string;
  account_email: string;
  display_name: string | null;
};

export async function GET(req: Request) {
  const auth = supabaseFromBearer(req);
  if (!auth) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const {
    data: { user },
    error: userErr,
  } = await auth.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let dateYmd = searchParams.get("date")?.trim() ?? "";
  if (!dateYmd) {
    const now = new Date();
    dateYmd = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  }
  if (!gmailSearchQueryForCalendarDay(dateYmd)) {
    return NextResponse.json({ error: "Invalid date (use YYYY-MM-DD)" }, { status: 400 });
  }

  const maxResults = Math.min(50, Math.max(1, Number(searchParams.get("maxResults")) || 25));
  const accountIdFilter = searchParams.get("accountId")?.trim() ?? "";

  let accQuery = auth
    .from("user_connected_accounts")
    .select("id,provider,account_email,display_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (accountIdFilter) {
    accQuery = accQuery.eq("id", accountIdFilter);
  }

  const { data: accounts, error: accErr } = await accQuery;

  if (accErr) {
    console.error("[mobile/email/today] accounts", accErr);
    return NextResponse.json({ error: "Failed to load connected accounts" }, { status: 500 });
  }

  const rows = (accounts ?? []) as AccountRow[];
  if (accountIdFilter && rows.length === 0) {
    // Use 400 (not 404) so clients don’t confuse “unknown account” with “API route missing on server”.
    return NextResponse.json(
      { error: "account_not_found", message: "No connected account with this id for your user." },
      { status: 400 },
    );
  }
  const sections: Array<{
    accountId: string;
    provider: string;
    accountEmail: string;
    displayName: string | null;
    messages: Awaited<ReturnType<typeof fetchGmailInboxMessagesForDay>>;
    error: string | null;
  }> = [];

  for (const row of rows) {
    if (row.provider === "google") {
      try {
        const { accessToken } = await getValidGoogleAccessToken(auth, user.id, row.id);
        const messages = await fetchGmailInboxMessagesForDay(accessToken, {
          dateYmd,
          folder: "inbox",
          maxResults,
        });
        sections.push({
          accountId: row.id,
          provider: row.provider,
          accountEmail: row.account_email,
          displayName: row.display_name,
          messages,
          error: null,
        });
      } catch (e) {
        const msg =
          e instanceof GoogleIntegrationError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not load mail.";
        sections.push({
          accountId: row.id,
          provider: row.provider,
          accountEmail: row.account_email,
          displayName: row.display_name,
          messages: [],
          error: msg,
        });
      }
    } else {
      sections.push({
        accountId: row.id,
        provider: row.provider,
        accountEmail: row.account_email,
        displayName: row.display_name,
        messages: [],
        error: null,
      });
    }
  }

  return NextResponse.json(
    { date: dateYmd, sections },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
