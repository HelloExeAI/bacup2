import { NextResponse } from "next/server";
import { z } from "zod";

import { runGmailProcessBatch } from "@/lib/email/gmailProcessBatch";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  accountId: z.string().uuid(),
  messageIds: z.array(z.string().min(2)).min(1).max(40),
  trigger: z.enum(["inbound", "sent", "reply", "forward", "reply_all"]).optional(),
});

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: z.infer<typeof BodySchema>;
  try {
    json = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: accountRow, error: accErr } = await supabase
    .from("user_connected_accounts")
    .select("id")
    .eq("id", json.accountId)
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  if (accErr || !accountRow?.id) {
    return NextResponse.json({ error: "Unknown Google account" }, { status: 404 });
  }

  let accessToken: string;
  try {
    const t = await getValidGoogleAccessToken(supabase, user.id, json.accountId);
    accessToken = t.accessToken;
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    throw e;
  }

  try {
    const result = await runGmailProcessBatch(supabase, user, {
      accountId: json.accountId,
      messageIds: json.messageIds,
      accessToken,
      trigger: json.trigger,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("[gmail/process-messages]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
