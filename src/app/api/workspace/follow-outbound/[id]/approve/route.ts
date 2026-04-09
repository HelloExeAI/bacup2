import { NextResponse } from "next/server";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { sendGmailNewPlainMessage } from "@/lib/integrations/google/gmailSendNewPlain";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  const { data: row, error: fetchErr } = await supabase
    .from("follow_outbound_log")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.status !== "pending_approval") {
    return NextResponse.json({ error: "Not pending approval" }, { status: 400 });
  }

  const accountId = row.connected_account_id as string | null;
  if (!accountId) {
    return NextResponse.json({ error: "Missing sender account on log" }, { status: 400 });
  }

  const sendRes = await sendGmailNewPlainMessage({
    supabase,
    userId: user.id,
    accountId,
    to: String(row.to_email),
    subject: String(row.subject),
    textPlain: String(row.body_plain),
  });

  if (!sendRes.ok) {
    await supabase
      .from("follow_outbound_log")
      .update({ status: "failed", error: sendRes.error })
      .eq("id", id)
      .eq("user_id", user.id);
    return NextResponse.json({ error: sendRes.error, detail: "detail" in sendRes ? sendRes.detail : undefined }, { status: 502 });
  }

  const gmailMessageId = sendRes.messageId ?? null;
  const gmailThreadId = sendRes.threadId ?? null;

  const now = new Date().toISOString();
  await supabase
    .from("follow_outbound_log")
    .update({
      status: "sent",
      sent_at: now,
      error: null,
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  const subId = row.subscription_id as string | null;
  if (subId) {
    const { data: sub } = await supabase
      .from("task_follow_subscription")
      .select("id,total_outbounds,reminder_interval_minutes")
      .eq("id", subId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (sub) {
      const interval = Math.max(5, Number(sub.reminder_interval_minutes) || 120);
      const next = new Date(Date.now() + interval * 60 * 1000).toISOString();
      await supabase
        .from("task_follow_subscription")
        .update({
          last_outbound_at: now,
          total_outbounds: Number(sub.total_outbounds) + 1,
          next_reminder_at: next,
        })
        .eq("id", subId);
    }
  }

  return NextResponse.json({ ok: true });
}
