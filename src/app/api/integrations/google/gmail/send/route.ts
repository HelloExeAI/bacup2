import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildReplyForwardRawAndThread } from "@/lib/integrations/google/gmailReplyForward";
import {
  buildEmailMime,
  htmlToPlainFallback,
  toGmailRaw,
  type OutgoingAttachment,
} from "@/lib/integrations/google/gmailMessageParse";
import {
  completePendingTasksForGmailMessage,
} from "@/lib/tasks/gmailFollowupDb";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";

export const dynamic = "force-dynamic";

type Body = {
  accountId?: string;
  mode?: "reply" | "reply_all" | "forward" | "new";
  originalMessageId?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  /** HTML from rich editor */
  htmlBody?: string;
  /** Optional plain override; otherwise derived from HTML */
  textPlain?: string;
  attachments?: OutgoingAttachment[];
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: Body;
  try {
    json = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accountId = json.accountId;
  const originalMessageId = json.originalMessageId?.trim();
  const mode = json.mode;
  const to = typeof json.to === "string" ? json.to.trim() : "";
  const cc = typeof json.cc === "string" ? json.cc.trim() : "";
  const bcc = typeof json.bcc === "string" ? json.bcc.trim() : "";
  const htmlIn = typeof json.htmlBody === "string" ? json.htmlBody : "";
  const textOverride = typeof json.textPlain === "string" ? json.textPlain.trim() : "";
  const attachments = Array.isArray(json.attachments) ? json.attachments : [];

  if (mode === "new") {
    if (!to) {
      return NextResponse.json({ error: "to required" }, { status: 400 });
    }
    if (!htmlIn.trim() && !textOverride) {
      return NextResponse.json({ error: "htmlBody or textPlain required" }, { status: 400 });
    }
    const htmlFinal = htmlIn.trim() ? htmlIn : `<p>${htmlToPlainFallback(textOverride).replaceAll("\n", "<br/>")}</p>`;
    const textPlain = textOverride || htmlToPlainFallback(htmlFinal);
    if (!textPlain.trim()) {
      return NextResponse.json({ error: "message body empty" }, { status: 400 });
    }
    const subject = json.subject?.trim() || "(no subject)";

    try {
      const { accessToken } = await getValidGoogleAccessToken(supabase, user.id, accountId);

      const mime = buildEmailMime({
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject,
        textPlain,
        html: htmlFinal,
        extraHeaders: {},
        attachments: attachments.filter((a) => a.filename && a.dataBase64),
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
        const errObj = sendJson?.error as { message?: string; code?: number } | undefined;
        const msg = errObj?.message ?? "";
        const isScope =
          sendRes.status === 403 &&
          (String(msg).toLowerCase().includes("insufficient") ||
            String(msg).toLowerCase().includes("permission"));
        return NextResponse.json(
          {
            error: "gmail_send_failed",
            detail: sendJson,
            hint: isScope
              ? "Reconnect Google in Settings → Integrations to grant send permission."
              : undefined,
          },
          { status: sendRes.status >= 400 && sendRes.status < 600 ? sendRes.status : 502 },
        );
      }

      return NextResponse.json({
        id: typeof sendJson?.id === "string" ? sendJson.id : undefined,
        threadId: typeof sendJson?.threadId === "string" ? sendJson.threadId : undefined,
      });
    } catch (e) {
      if (e instanceof GoogleIntegrationError) {
        const status = e.code === "not_connected" ? 404 : 401;
        return NextResponse.json({ error: e.code, message: e.message }, { status });
      }
      console.error("[google/gmail/send]", e);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  }

  if (!originalMessageId || (mode !== "reply" && mode !== "reply_all" && mode !== "forward")) {
    return NextResponse.json({ error: "originalMessageId and valid mode required" }, { status: 400 });
  }
  if (!to) {
    return NextResponse.json({ error: "to required" }, { status: 400 });
  }
  if (!htmlIn.trim() && !textOverride) {
    return NextResponse.json({ error: "htmlBody or textPlain required" }, { status: 400 });
  }

  const htmlFinal = htmlIn.trim() ? htmlIn : `<p>${htmlToPlainFallback(textOverride).replaceAll("\n", "<br/>")}</p>`;
  const textPlain = textOverride || htmlToPlainFallback(htmlFinal);
  if (!textPlain.trim()) {
    return NextResponse.json({ error: "message body empty" }, { status: 400 });
  }

  try {
    const { accessToken } = await getValidGoogleAccessToken(supabase, user.id, accountId);

    const built = await buildReplyForwardRawAndThread({
      accessToken,
      originalMessageId,
      mode,
      to,
      cc,
      subject: json.subject,
      htmlBody: htmlIn,
      textPlain: textOverride,
      attachments,
    });

    if (!built.ok) {
      return NextResponse.json(
        { error: "gmail_fetch_original_failed", detail: built.detail },
        { status: built.status },
      );
    }

    const sendBody: Record<string, unknown> = { raw: built.raw };
    if ((mode === "reply" || mode === "reply_all") && built.threadId) {
      sendBody.threadId = built.threadId;
    }

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendBody),
    });
    const sendJson = (await sendRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!sendRes.ok) {
      const errObj = sendJson?.error as { message?: string; code?: number } | undefined;
      const msg = errObj?.message ?? "";
      const isScope =
        sendRes.status === 403 &&
        (String(msg).toLowerCase().includes("insufficient") ||
          String(msg).toLowerCase().includes("permission"));
      return NextResponse.json(
        {
          error: "gmail_send_failed",
          detail: sendJson,
          hint: isScope
            ? "Reconnect Google in Settings → Integrations to grant send permission."
            : undefined,
        },
        { status: sendRes.status >= 400 && sendRes.status < 600 ? sendRes.status : 502 },
      );
    }

    try {
      await completePendingTasksForGmailMessage(supabase, user, originalMessageId);
    } catch (e) {
      console.warn("[google/gmail/send] complete follow-up tasks", e);
    }

    return NextResponse.json({
      id: typeof sendJson?.id === "string" ? sendJson.id : undefined,
      threadId: typeof sendJson?.threadId === "string" ? sendJson.threadId : undefined,
    });
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("[google/gmail/send]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
