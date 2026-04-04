import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  collectCidAttachmentMap,
  computeReplyAllRecipients,
  extractTextFromPayload,
  headerMap,
  rewriteHtmlCidSources,
  type GmailApiPart,
  type GmailPartExt,
} from "@/lib/integrations/google/gmailMessageParse";
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
  const messageId = searchParams.get("messageId")?.trim();
  if (!messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }

  try {
    const { accessToken, account } = await getValidGoogleAccessToken(supabase, user.id, accountId);
    const resolvedAccountId = account.id;

    const metaUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
    );
    metaUrl.searchParams.set("format", "full");

    const mRes = await fetch(metaUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const mJson = (await mRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!mRes.ok) {
      return NextResponse.json(
        { error: "gmail_message_failed", detail: mJson },
        { status: mRes.status >= 400 && mRes.status < 600 ? mRes.status : 502 },
      );
    }

    const rawPayload = mJson?.payload as
      | (GmailApiPart & { headers?: { name?: string; value?: string }[] })
      | undefined;
    const headers = headerMap(rawPayload?.headers);
    const fromHeader = headers["from"] ?? headers["sender"] ?? "";
    const toHeader = headers["to"] ?? "";
    const ccHeader = headers["cc"] ?? "";
    const { text: textBody, html: htmlRaw } = extractTextFromPayload(rawPayload);

    const cidMap = new Map<string, string>();
    collectCidAttachmentMap(rawPayload as GmailPartExt, cidMap);

    const origin = new URL(req.url).origin;
    let htmlBody = htmlRaw ?? "";
    if (htmlBody && cidMap.size > 0) {
      htmlBody = rewriteHtmlCidSources(htmlBody, origin, messageId, resolvedAccountId, cidMap);
    }

    const replyAll = computeReplyAllRecipients(headers, account.account_email);

    return NextResponse.json({
      id: typeof mJson?.id === "string" ? mJson.id : messageId,
      threadId: typeof mJson?.threadId === "string" ? mJson.threadId : undefined,
      subject: headers["subject"] ?? "(no subject)",
      from: fromHeader,
      to: toHeader,
      cc: ccHeader,
      date: headers["date"] ?? "",
      textBody,
      htmlBody,
      snippet: typeof mJson?.snippet === "string" ? mJson.snippet : "",
      messageIdHeader: headers["message-id"] ?? "",
      references: headers["references"] ?? "",
      mailboxEmail: account.account_email,
      replyAll,
    });
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("[google/gmail/message]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
