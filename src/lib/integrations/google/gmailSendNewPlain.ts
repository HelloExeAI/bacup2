import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildEmailMime,
  htmlToPlainFallback,
  toGmailRaw,
} from "@/lib/integrations/google/gmailMessageParse";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";

export async function sendGmailNewPlainMessage(params: {
  supabase: SupabaseClient;
  userId: string;
  accountId: string;
  /** Comma-separated RFC 5322 To list (one or more addresses). */
  to: string;
  /** Comma-separated RFC 5322 Cc list (optional). */
  cc?: string;
  subject: string;
  textPlain: string;
}): Promise<
  { ok: true; messageId?: string; threadId?: string } | { ok: false; error: string; detail?: unknown }
> {
  const to = params.to.trim();
  const subject = params.subject.trim() || "(no subject)";
  const textPlain = params.textPlain.trim();
  if (!to || !textPlain) {
    return { ok: false, error: "to_and_body_required" };
  }

  const htmlFinal = `<p>${htmlToPlainFallback(textPlain).replaceAll("\n", "<br/>")}</p>`;

  try {
    const { accessToken } = await getValidGoogleAccessToken(params.supabase, params.userId, params.accountId);

    const mime = buildEmailMime({
      to,
      ...(params.cc?.trim() ? { cc: params.cc.trim() } : {}),
      subject,
      textPlain,
      html: htmlFinal,
      extraHeaders: {},
      attachments: [],
    });

    const raw = toGmailRaw(mime);

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    const sendJson = (await sendRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!sendRes.ok) {
      return { ok: false, error: "gmail_send_failed", detail: sendJson };
    }

    return {
      ok: true,
      messageId: typeof sendJson?.id === "string" ? sendJson.id : undefined,
      threadId: typeof sendJson?.threadId === "string" ? sendJson.threadId : undefined,
    };
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      return { ok: false, error: e.code, detail: e.message };
    }
    return { ok: false, error: "server_error", detail: String(e) };
  }
}
