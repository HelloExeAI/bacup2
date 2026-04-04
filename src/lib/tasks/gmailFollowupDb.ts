import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import { calendarYmdInTimeZone } from "@/lib/email/calendarYmd";
import { defaultDueTimeQuarterHour } from "@/lib/datetime/quarterHour";

export type GmailFollowupKind = "reply_later";

export async function getActorDisplayName(
  supabase: SupabaseClient,
  user: User,
): Promise<string> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name, name")
    .eq("id", user.id)
    .maybeSingle();

  const actorName =
    [prof?.display_name, prof?.name]
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .find((s) => s.length > 0) ||
    (typeof user.email === "string" ? user.email.split("@")[0] : "") ||
    "User";

  return actorName;
}

export async function upsertGmailFollowupTask(
  supabase: SupabaseClient,
  user: User,
  params: {
    accountId: string;
    gmailMessageId: string;
    gmailThreadId: string | null;
    kind: GmailFollowupKind;
    subject: string;
    /**
     * YYYY-MM-DD for “today” in the user’s browser — matches Today Focus / Watch List.
     * If omitted, falls back to profile timezone (can disagree with the UI).
     */
    dueDate?: string;
  },
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const tz = typeof profile?.timezone === "string" ? profile.timezone : "UTC";
  const clientYmd = params.dueDate?.trim();
  const dueDate =
    clientYmd && /^\d{4}-\d{2}-\d{2}$/.test(clientYmd) ? clientYmd : calendarYmdInTimeZone(tz);

  const titleBase = `Reply: ${params.subject.slice(0, 160)}`;
  const title = titleBase.length > 200 ? `${titleBase.slice(0, 197)}…` : titleBase;

  const description = `Gmail follow-up (message ${params.gmailMessageId})`;

  const { data: existing } = await supabase
    .from("tasks")
    .select("id")
    .eq("user_id", user.id)
    .eq("gmail_message_id", params.gmailMessageId)
    .eq("gmail_followup_kind", params.kind)
    .eq("status", "pending")
    .maybeSingle();

  if (existing?.id) {
    const editorName = await getActorDisplayName(supabase, user);
    const { data: updated, error } = await supabase
      .from("tasks")
      .update({
        title,
        description,
        due_date: dueDate,
        gmail_thread_id: params.gmailThreadId,
        connected_account_id: params.accountId,
        last_edited_by_name: editorName,
      })
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return updated;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title,
      description,
      due_date: dueDate,
      due_time: defaultDueTimeQuarterHour(),
      type: "todo",
      assigned_to: "self",
      status: "pending",
      completed_at: null,
      source: "manual",
      gmail_message_id: params.gmailMessageId,
      gmail_thread_id: params.gmailThreadId,
      connected_account_id: params.accountId,
      gmail_followup_kind: params.kind,
    })
    .select("*")
    .maybeSingle();

  if (insErr) throw insErr;
  return inserted;
}

export async function completePendingTasksForGmailMessage(
  supabase: SupabaseClient,
  user: User,
  gmailMessageId: string,
): Promise<{ completed: number }> {
  const actorName = await getActorDisplayName(supabase, user);
  const now = new Date().toISOString();

  const { data: rows } = await supabase
    .from("tasks")
    .select("id")
    .eq("user_id", user.id)
    .eq("gmail_message_id", gmailMessageId)
    .eq("status", "pending");

  const n = rows?.length ?? 0;
  if (n === 0) return { completed: 0 };

  const { error } = await supabase
    .from("tasks")
    .update({
      status: "done",
      completed_at: now,
      completed_by_name: actorName,
    })
    .eq("user_id", user.id)
    .eq("gmail_message_id", gmailMessageId)
    .eq("status", "pending");

  if (error) throw error;
  return { completed: n };
}
