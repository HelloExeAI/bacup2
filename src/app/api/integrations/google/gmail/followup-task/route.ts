import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { upsertGmailFollowupTask } from "@/lib/tasks/gmailFollowupDb";
import {
  getValidGoogleAccessToken,
  GoogleIntegrationError,
} from "@/lib/integrations/google/googleAccessToken";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  accountId: z.string().uuid(),
  gmailMessageId: z.string().min(2),
  gmailThreadId: z.string().min(2).nullable().optional(),
  kind: z.literal("reply_later"),
  subject: z.string().min(1).max(500),
  /** Local calendar day (YYYY-MM-DD) — must match Today Focus “today”. */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: z.infer<typeof BodySchema>;
  try {
    json = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    await getValidGoogleAccessToken(supabase, user.id, json.accountId);
  } catch (e) {
    if (e instanceof GoogleIntegrationError) {
      const status = e.code === "not_connected" ? 404 : 401;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    throw e;
  }

  try {
    const task = await upsertGmailFollowupTask(supabase, user, {
      accountId: json.accountId,
      gmailMessageId: json.gmailMessageId.trim(),
      gmailThreadId: json.gmailThreadId ?? null,
      kind: json.kind,
      subject: json.subject.trim(),
      dueDate: json.dueDate,
    });

    return NextResponse.json({ ok: true, task });
  } catch (e) {
    console.error("[gmail/followup-task]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
