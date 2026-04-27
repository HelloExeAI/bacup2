import { NextResponse } from "next/server";

import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractOpenAIUsageFromChatCompletion } from "@/lib/billing/openaiUsageFromResponse";
import { isConsumerEmailDomain } from "@/lib/email/consumerEmailDomain";
import { fetchGmailInboxMessagesForDay } from "@/lib/integrations/google/gmailListMessagesForDay";
import { gmailSearchQueryForCalendarDay } from "@/lib/integrations/google/gmailDaySearchQuery";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";
import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";

export const dynamic = "force-dynamic";

type BriefAccount = {
  accountId: string;
  accountEmail: string;
  domainKind: "consumer" | "workspace";
  /** Inbox messages used for digest (workspace only). */
  messageCount?: number;
  lines: string[];
  source: "skipped_consumer" | "template_empty" | "openai" | "fallback";
};

function parseBulletLines(text: string, max: number): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•·]\s*/, "· ").trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("· ") ? l : `· ${l}`))
    .map((l) => {
      const s = l.replace(/\s+/g, " ").trim();
      if (s.length <= 160) return s;
      return `${s.slice(0, 159).trimEnd()}…`;
    })
    .slice(0, max);
}

function formatMessagesForPrompt(
  rows: Awaited<ReturnType<typeof fetchGmailInboxMessagesForDay>>,
  maxMsgs: number,
): string {
  const slice = rows.filter((m) => !m.error).slice(0, maxMsgs);
  if (slice.length === 0) return "(no messages)";
  return slice
    .map((m, i) => {
      const subj = (m.subject ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      const from = (m.from ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      const snip = (m.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
      return `${i + 1}. From: ${from}\n   Subject: ${subj}\n   Snippet: ${snip}`;
    })
    .join("\n\n");
}

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

  const { data: accounts, error: accErr } = await auth
    .from("user_connected_accounts")
    .select("id,provider,account_email")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .order("created_at", { ascending: true });

  if (accErr) {
    console.error("[mobile/overview/inbox-brief] accounts", accErr);
    return NextResponse.json({ error: "Failed to load connected accounts" }, { status: 500 });
  }

  const rows = (accounts ?? []) as { id: string; provider: string; account_email: string }[];
  const accountsOut: BriefAccount[] = [];

  for (const row of rows) {
    const email = row.account_email;
    if (isConsumerEmailDomain(email)) {
      accountsOut.push({
        accountId: row.id,
        accountEmail: email,
        domainKind: "consumer",
        messageCount: 0,
        lines: [],
        source: "skipped_consumer",
      });
      continue;
    }

    try {
      const { accessToken } = await getValidGoogleAccessToken(auth, user.id, row.id);
      const messages = await fetchGmailInboxMessagesForDay(accessToken, {
        dateYmd,
        folder: "inbox",
        maxResults: 15,
      });
      const okMsgs = messages.filter((m) => !m.error);
      if (okMsgs.length === 0) {
        accountsOut.push({
          accountId: row.id,
          accountEmail: email,
          domainKind: "workspace",
          messageCount: 0,
          lines: ["· No messages in today's inbox."],
          source: "template_empty",
        });
        continue;
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        accountsOut.push({
          accountId: row.id,
          accountEmail: email,
          domainKind: "workspace",
          messageCount: okMsgs.length,
          lines: [
            `· ${okMsgs.length} message${okMsgs.length === 1 ? "" : "s"} today — open Messages → Email for details.`,
          ],
          source: "fallback",
        });
        continue;
      }

      const quota = await assertOpenAIQuotaAvailable(auth, user.id, 900);
      if (!quota.ok) {
        accountsOut.push({
          accountId: row.id,
          accountEmail: email,
          domainKind: "workspace",
          messageCount: okMsgs.length,
          lines: [`· ${okMsgs.length} new message${okMsgs.length === 1 ? "" : "s"} today (AI digest paused — quota).`],
          source: "fallback",
        });
        continue;
      }

      const block = formatMessagesForPrompt(messages, 15);
      const system = [
        "You summarize today's inbox for a professional using a productivity app.",
        "Output EXACTLY 2 to 4 lines.",
        "Each line MUST start with '· ' (middle dot + space).",
        "Plain text only. No markdown, no numbering, no emojis.",
        "Prioritize: deadlines, money, security, meetings, direct asks from people (not bulk newsletters).",
        "If everything looks like promos/low signal, say so in one line after '· '.",
      ].join("\n");

      const userMsg = `Mailbox: ${email}\nDate (inbox filter): ${dateYmd}\n\nEmails:\n${block}`;

      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.25,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
          max_tokens: 220,
        }),
      });

      const body = await resp.json().catch(() => null);
      if (!resp.ok) {
        accountsOut.push({
          accountId: row.id,
          accountEmail: email,
          domainKind: "workspace",
          messageCount: okMsgs.length,
          lines: [`· ${okMsgs.length} message${okMsgs.length === 1 ? "" : "s"} today — open Email for the list.`],
          source: "fallback",
        });
        continue;
      }

      const u = extractOpenAIUsageFromChatCompletion(body);
      if (u && u.totalTokens > 0) {
        await recordOpenAITokenUsage(auth, user.id, u.totalTokens);
      }

      const text: string = body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.message?.text ?? "";
      const raw = parseBulletLines(String(text).trim(), 4);
      const lines =
        raw.length >= 2
          ? raw.slice(0, 4)
          : raw.length === 1
            ? raw
            : [`· ${okMsgs.length} message${okMsgs.length === 1 ? "" : "s"} today — review in Email.`];

      accountsOut.push({
        accountId: row.id,
        accountEmail: email,
        domainKind: "workspace",
        messageCount: okMsgs.length,
        lines,
        source: "openai",
      });
    } catch (e) {
      const msg =
        e instanceof GoogleIntegrationError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not load mail.";
      accountsOut.push({
        accountId: row.id,
        accountEmail: email,
        domainKind: "workspace",
        messageCount: 0,
        lines: [`· ${msg}`],
        source: "fallback",
      });
    }
  }

  return NextResponse.json(
    { date: dateYmd, accounts: accountsOut },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
