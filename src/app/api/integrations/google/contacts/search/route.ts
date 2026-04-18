import { NextResponse } from "next/server";

import {
  GOOGLE_OTHER_CONTACTS_MIN_QUERY,
  GooglePeopleSearchError,
  searchGoogleOtherContacts,
} from "@/lib/integrations/google/googleOtherContactsSearch";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken, GoogleIntegrationError } from "@/lib/integrations/google/googleAccessToken";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId")?.trim();
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }
  if (q.length < GOOGLE_OTHER_CONTACTS_MIN_QUERY) {
    return NextResponse.json({ contacts: [] as { email: string; displayName: string | null }[] });
  }

  let accessToken: string;
  try {
    const t = await getValidGoogleAccessToken(supabase, user.id, accountId);
    accessToken = t.accessToken;
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    throw e;
  }

  try {
    const rows = await searchGoogleOtherContacts(accessToken, q);
    const contacts = rows.map((r) => ({
      email: r.email,
      displayName: r.displayName,
      resourceName: r.resourceName,
    }));
    return NextResponse.json({ contacts });
  } catch (e) {
    if (e instanceof GooglePeopleSearchError) {
      const msg = e.message;
      const hint =
        e.status === 403 && /insufficient|permission|scope/i.test(msg)
          ? "Reconnect Google in Settings → Integrations to grant contact search (Other Contacts)."
          : undefined;
      return NextResponse.json(
        { error: "people_search_failed", detail: e.body, hint },
        { status: e.status >= 400 && e.status < 600 ? e.status : 502 },
      );
    }
    throw e;
  }
}

