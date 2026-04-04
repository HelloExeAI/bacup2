import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gmailSearchQueryForCalendarDay } from "@/lib/integrations/google/gmailDaySearchQuery";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";

export const dynamic = "force-dynamic";

type GmailHeader = { name?: string; value?: string };

function headerMap(headers: GmailHeader[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const h of headers ?? []) {
    const n = h.name?.toLowerCase();
    if (n && h.value) m[n] = h.value;
  }
  return m;
}

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
  const label = folderRaw === "sent" ? "in:sent" : "in:inbox";
  const listQ = `${label} ${dayQuery}`.trim();

  try {
    const { accessToken } = await getValidGoogleAccessToken(supabase, user.id, accountId);

    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults", String(maxResults));
    listUrl.searchParams.set("q", listQ);

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listJson = (await listRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!listRes.ok) {
      console.warn("[google/gmail] list", listRes.status, listJson);
      return NextResponse.json(
        { error: "gmail_list_failed", detail: listJson },
        { status: listRes.status >= 400 && listRes.status < 600 ? listRes.status : 502 },
      );
    }

    const raw = listJson?.messages;
    const ids = Array.isArray(raw)
      ? (raw as { id?: unknown }[])
          .map((m) => (typeof m?.id === "string" ? m.id : null))
          .filter((x): x is string => x !== null)
      : [];

    const messages = await Promise.all(
      ids.map(async (id) => {
        const metaUrl = new URL(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`,
        );
        metaUrl.searchParams.set("format", "metadata");
        metaUrl.searchParams.append("metadataHeaders", "Subject");
        metaUrl.searchParams.append("metadataHeaders", "From");
        metaUrl.searchParams.append("metadataHeaders", "Date");

        const mRes = await fetch(metaUrl.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const mJson = (await mRes.json().catch(() => null)) as Record<string, unknown> | null;
        if (!mRes.ok) {
          return { id, error: true };
        }
        const payload = mJson?.payload as { headers?: GmailHeader[] } | undefined;
        const h = headerMap(payload?.headers);
        return {
          id,
          threadId: typeof mJson?.threadId === "string" ? mJson.threadId : undefined,
          subject: h.subject ?? "(no subject)",
          from: h.from ?? "",
          date: h.date ?? "",
          snippet: typeof mJson?.snippet === "string" ? mJson.snippet : "",
        };
      }),
    );

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
