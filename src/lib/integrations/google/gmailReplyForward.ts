import {
  buildEmailMime,
  extractTextFromPayload,
  forwardSubject,
  headerMap,
  htmlToPlainFallback,
  replySubject,
  toGmailRaw,
  type GmailApiPart,
  type OutgoingAttachment,
} from "@/lib/integrations/google/gmailMessageParse";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds Gmail `raw` (base64url) and optional thread id for reply / reply_all / forward.
 */
export async function buildReplyForwardRawAndThread(params: {
  accessToken: string;
  originalMessageId: string;
  mode: "reply" | "reply_all" | "forward";
  to: string;
  cc: string;
  subject?: string;
  htmlBody: string;
  textPlain?: string;
  attachments: OutgoingAttachment[];
}): Promise<
  | { ok: true; raw: string; threadId?: string }
  | { ok: false; status: number; detail: unknown }
> {
  const htmlIn = params.htmlBody;
  const textOverride = params.textPlain?.trim() ?? "";
  const htmlFinal = htmlIn.trim()
    ? htmlIn
    : `<p>${htmlToPlainFallback(textOverride).replaceAll("\n", "<br/>")}</p>`;
  let textPlain = textOverride || htmlToPlainFallback(htmlFinal);
  if (!textPlain.trim()) {
    textPlain = " ";
  }

  const metaUrl = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(params.originalMessageId)}`,
  );
  metaUrl.searchParams.set("format", "full");

  const mRes = await fetch(metaUrl.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  const mJson = (await mRes.json().catch(() => null)) as Record<string, unknown> | null;
  if (!mRes.ok) {
    return {
      ok: false,
      status: mRes.status >= 400 && mRes.status < 600 ? mRes.status : 502,
      detail: mJson,
    };
  }

  const payload = mJson?.payload as
    | (GmailApiPart & { headers?: { name?: string; value?: string }[] })
    | undefined;
  const headers = headerMap(payload?.headers);
  const subjectOrig = headers["subject"] ?? "(no subject)";
  const { text: originalBody } = extractTextFromPayload(payload);
  const threadId = typeof mJson?.threadId === "string" ? mJson.threadId : undefined;
  const messageIdHdr = headers["message-id"] ?? "";
  const refs = headers["references"] ?? "";
  const fromHeader = headers["from"] ?? "";

  let subject = params.subject?.trim();
  let bodyHtml = htmlFinal;
  let bodyText = textPlain;

  if (params.mode === "forward") {
    subject = subject || forwardSubject(subjectOrig);
    const fwdPlain = [
      bodyText,
      "",
      "---------- Forwarded message ---------",
      `From: ${fromHeader}`,
      `Date: ${headers["date"] ?? ""}`,
      `Subject: ${subjectOrig}`,
      "",
      originalBody || "(no body)",
    ].join("\n");
    bodyText = fwdPlain;
    bodyHtml = `${htmlFinal}<hr/><p style="font-size:12px;font-weight:600;color:#555;font-family:Montserrat,Helvetica,Arial,sans-serif;line-height:1.5">---------- Forwarded message ---------</p><p style="font-size:12px;line-height:1.5;font-family:Montserrat,Helvetica,Arial,sans-serif">From: ${escapeHtml(fromHeader)}<br/>Date: ${escapeHtml(headers["date"] ?? "")}<br/>Subject: ${escapeHtml(subjectOrig)}</p><pre style="white-space:pre-wrap;font-family:Montserrat,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;margin:0;padding:12px;border-radius:8px;background:rgba(0,0,0,.04)">${escapeHtml(originalBody || "(no body)")}</pre>`;
  } else {
    subject = subject || replySubject(subjectOrig);
  }

  const extra: Record<string, string> = {};
  if (params.mode === "reply" || params.mode === "reply_all") {
    if (messageIdHdr) extra["In-Reply-To"] = messageIdHdr;
    const refLine = refs ? `${refs} ${messageIdHdr}`.trim() : messageIdHdr;
    if (refLine) extra.References = refLine;
  }

  const mime = buildEmailMime({
    to: params.to,
    cc: params.cc || undefined,
    subject,
    textPlain: bodyText,
    html: bodyHtml,
    extraHeaders: extra,
    attachments: params.attachments.filter((a) => a.filename && a.dataBase64),
  });

  const raw = toGmailRaw(mime);
  return {
    ok: true,
    raw,
    threadId: params.mode === "reply" || params.mode === "reply_all" ? threadId : undefined,
  };
}
