import { NextResponse } from "next/server";

import { Buffer } from "node:buffer";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";

export const dynamic = "force-dynamic";

function guessImageMime(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.length >= 4 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "image/webp";
  return "application/octet-stream";
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
  const messageId = searchParams.get("messageId")?.trim();
  const attachmentId = searchParams.get("attachmentId")?.trim();
  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: "messageId and attachmentId required" }, { status: 400 });
  }

  try {
    const { accessToken } = await getValidGoogleAccessToken(supabase, user.id, accountId);

    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const j = (await res.json().catch(() => null)) as { data?: string; size?: number } | null;
    if (!res.ok || !j?.data) {
      return NextResponse.json({ error: "attachment_fetch_failed" }, { status: res.status === 404 ? 404 : 502 });
    }

    const pad = j.data.length % 4 === 0 ? "" : "=".repeat(4 - (j.data.length % 4));
    const b64 = j.data.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const buf = Buffer.from(b64, "base64");
    const ct = guessImageMime(buf);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("[google/gmail/attachment]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
