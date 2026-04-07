import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken, GoogleIntegrationError } from "@/lib/integrations/google/googleAccessToken";

export const dynamic = "force-dynamic";

const MIN_QUERY = 3;

type PeopleSearchResult = {
  person?: {
    emailAddresses?: { value?: string; metadata?: { primary?: boolean } }[];
    names?: { displayName?: string; givenName?: string; familyName?: string; metadata?: { primary?: boolean } }[];
  };
};

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
  if (q.length < MIN_QUERY) {
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

  const apiUrl = new URL("https://people.googleapis.com/v1/otherContacts:search");
  apiUrl.searchParams.set("query", q);
  apiUrl.searchParams.set("readMask", "names,emailAddresses");
  apiUrl.searchParams.set("pageSize", "12");

  const res = await fetch(apiUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok) {
    const err = json?.error as { message?: string; status?: string } | undefined;
    const msg = typeof err?.message === "string" ? err.message : "people_search_failed";
    const hint =
      res.status === 403 && /insufficient|permission|scope/i.test(msg)
        ? "Reconnect Google in Settings → Integrations to grant contact search (Other Contacts)."
        : undefined;
    return NextResponse.json(
      { error: "people_search_failed", detail: json, hint },
      { status: res.status >= 400 && res.status < 600 ? res.status : 502 },
    );
  }

  const results = Array.isArray(json?.results) ? (json.results as PeopleSearchResult[]) : [];
  const out: { email: string; displayName: string | null }[] = [];
  const seen = new Set<string>();

  for (const row of results) {
    const person = row.person;
    const emails = person?.emailAddresses ?? [];
    const names = person?.names ?? [];
    const displayName =
      names.find((n) => n.metadata?.primary)?.displayName ||
      names[0]?.displayName ||
      [names[0]?.givenName, names[0]?.familyName].filter(Boolean).join(" ").trim() ||
      null;

    for (const ea of emails) {
      const email = typeof ea.value === "string" ? ea.value.trim().toLowerCase() : "";
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push({ email, displayName: displayName || null });
      if (out.length >= 10) break;
    }
    if (out.length >= 10) break;
  }

  return NextResponse.json({ contacts: out });
}
