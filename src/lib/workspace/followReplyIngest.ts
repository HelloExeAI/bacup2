import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchGmailThreadMessages } from "@/lib/integrations/google/gmailThreadFetch";
import { getValidGoogleAccessToken } from "@/lib/integrations/google/googleAccessToken";
import { formatFollowReplyDescriptionAppend } from "@/lib/workspace/followReplyComment";
import { parseFollowReplyText } from "@/lib/workspace/followReplyParse";

type TaskSnap = {
  status: string;
  assigned_to: string | null;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
};

type OutLog = {
  id: string;
  user_id: string;
  task_id: string | null;
  subscription_id: string | null;
  gmail_message_id: string;
  gmail_thread_id: string;
  connected_account_id: string | null;
  to_email: string;
};

function assigneeLikelyMatch(fromEmail: string, assigneeEmail: string): boolean {
  const a = fromEmail.trim().toLowerCase();
  const b = assigneeEmail.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const aLocal = a.split("@")[0] ?? "";
  const bLocal = b.split("@")[0] ?? "";
  if (aLocal && bLocal && aLocal === bLocal) return true;
  return false;
}

export async function runFollowReplyIngestTick(admin: SupabaseClient): Promise<{
  examined: number;
  applied: number;
  noopRecorded: number;
  skipped: number;
  errors: number;
}> {
  let examined = 0;
  let applied = 0;
  let noopRecorded = 0;
  let skipped = 0;
  let errors = 0;

  const parseCache = new Map<string, boolean>();

  async function replyParseEnabled(userId: string): Promise<boolean> {
    if (parseCache.has(userId)) return parseCache.get(userId)!;
    const { data } = await admin
      .from("workspace_follow_settings")
      .select("reply_parse_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    const v = data?.reply_parse_enabled !== false;
    parseCache.set(userId, v);
    return v;
  }

  const { data: logs, error: logErr } = await admin
    .from("follow_outbound_log")
    .select("id,user_id,task_id,subscription_id,gmail_message_id,gmail_thread_id,connected_account_id,to_email")
    .eq("status", "sent")
    .not("gmail_thread_id", "is", null)
    .not("gmail_message_id", "is", null)
    .not("task_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(180);

  if (logErr || !logs?.length) {
    return { examined: 0, applied: 0, noopRecorded: 0, skipped: 0, errors: logErr ? 1 : 0 };
  }

  for (const raw of logs as OutLog[]) {
    examined += 1;
    if (!(await replyParseEnabled(raw.user_id))) {
      skipped += 1;
      continue;
    }
    if (!raw.connected_account_id || !raw.task_id) {
      skipped += 1;
      continue;
    }

    const { data: existing } = await admin
      .from("follow_reply_events")
      .select("id")
      .eq("user_id", raw.user_id)
      .eq("outbound_log_id", raw.id)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      skipped += 1;
      continue;
    }

    try {
      const { accessToken, account } = await getValidGoogleAccessToken(
        admin,
        raw.user_id,
        raw.connected_account_id,
      );
      const founderEmail = account.account_email.toLowerCase();

      const messages = await fetchGmailThreadMessages(accessToken, raw.gmail_thread_id);
      if (messages.length === 0) {
        skipped += 1;
        continue;
      }

      const idx = messages.findIndex((m) => m.id === raw.gmail_message_id);
      if (idx === -1) {
        skipped += 1;
        continue;
      }

      const after = messages.slice(idx + 1);
      const assignee = raw.to_email.trim().toLowerCase();

      const candidates = after.filter((m) => {
        if (!m.fromEmail) return false;
        if (m.fromEmail.includes(founderEmail)) return false;
        return assigneeLikelyMatch(m.fromEmail, assignee);
      });

      const loose = after.filter((m) => m.fromEmail && !m.fromEmail.includes(founderEmail));
      const pool = candidates.length > 0 ? candidates : loose;

      const reply = pool[pool.length - 1];
      if (!reply || !reply.text.trim()) {
        skipped += 1;
        continue;
      }

      const { data: dup } = await admin
        .from("follow_reply_events")
        .select("id")
        .eq("user_id", raw.user_id)
        .eq("gmail_message_id", reply.id)
        .maybeSingle();

      if (dup?.id) {
        skipped += 1;
        continue;
      }

      const parsed = parseFollowReplyText(reply.text);

      const { data: task, error: taskErr } = await admin
        .from("tasks")
        .select("id,status,assigned_to,description,due_date,due_time,completed_at,completed_by_name,user_id")
        .eq("id", raw.task_id)
        .eq("user_id", raw.user_id)
        .maybeSingle();

      if (taskErr || !task || task.status !== "pending") {
        skipped += 1;
        continue;
      }

      const before: TaskSnap = {
        status: String(task.status),
        assigned_to: task.assigned_to ?? null,
        description: task.description ?? null,
        due_date: task.due_date ?? null,
        due_time: task.due_time ?? null,
        completed_at: task.completed_at ?? null,
        completed_by_name: task.completed_by_name ?? null,
      };

      const commentBlock = formatFollowReplyDescriptionAppend(parsed.status_label, reply.text);

      if (parsed.intent === "noop") {
        const nextDescription = `${before.description ?? ""}\n\n${commentBlock}`.trim();
        const { error: upNoop } = await admin
          .from("tasks")
          .update({
            description: nextDescription,
            last_edited_by_name: "Email reply",
          })
          .eq("id", raw.task_id)
          .eq("user_id", raw.user_id);

        if (upNoop) {
          errors += 1;
          continue;
        }

        const { error: insNoop } = await admin.from("follow_reply_events").insert({
          user_id: raw.user_id,
          task_id: raw.task_id,
          subscription_id: raw.subscription_id,
          outbound_log_id: raw.id,
          gmail_message_id: reply.id,
          gmail_thread_id: raw.gmail_thread_id,
          from_email_preview: reply.fromEmail.slice(0, 320),
          raw_text: reply.text.slice(0, 8000),
          intent: "noop",
          status_label: parsed.status_label,
          source: "email_reply",
          task_snapshot_before: before as unknown as Record<string, unknown>,
          task_updates_applied: { description: nextDescription },
        });
        if (insNoop) {
          errors += 1;
          await admin
            .from("tasks")
            .update({
              description: before.description,
              last_edited_by_name: null,
            })
            .eq("id", raw.task_id)
            .eq("user_id", raw.user_id);
          continue;
        }
        noopRecorded += 1;
        continue;
      }

      const updates: Record<string, unknown> = {};
      let taskUpdates: Record<string, unknown> = {};

      if (parsed.intent === "done") {
        updates.status = "done";
        updates.completed_at = new Date().toISOString();
        updates.completed_by_name = "Email reply";
        updates.description = `${before.description ?? ""}\n\n${commentBlock}`.trim();
        updates.last_edited_by_name = "Email reply";
        taskUpdates = { status: "done", description: updates.description };
      } else if (parsed.intent === "reassigned" && parsed.reassignTo) {
        const next = parsed.reassignTo.trim().slice(0, 120);
        updates.assigned_to = next;
        updates.last_edited_by_name = "Email reply";
        updates.description = `${before.description ?? ""}\n\n${commentBlock}`.trim();
        taskUpdates = { assigned_to: next, description: updates.description };
      } else if (parsed.intent === "in_progress") {
        updates.description = `${before.description ?? ""}\n\n${commentBlock}`.trim();
        updates.last_edited_by_name = "Email reply";
        taskUpdates = { description: updates.description };
      }

      if (Object.keys(updates).length === 0) {
        skipped += 1;
        continue;
      }

      const { error: upErr } = await admin.from("tasks").update(updates).eq("id", raw.task_id).eq("user_id", raw.user_id);

      if (upErr) {
        errors += 1;
        continue;
      }

      if (parsed.intent === "done" && raw.task_id) {
        await admin
          .from("task_follow_subscription")
          .update({ enabled: false })
          .eq("task_id", raw.task_id)
          .eq("user_id", raw.user_id);
      }

      const { error: insErr } = await admin.from("follow_reply_events").insert({
        user_id: raw.user_id,
        task_id: raw.task_id,
        subscription_id: raw.subscription_id,
        outbound_log_id: raw.id,
        gmail_message_id: reply.id,
        gmail_thread_id: raw.gmail_thread_id,
        from_email_preview: reply.fromEmail.slice(0, 320),
        raw_text: reply.text.slice(0, 8000),
        intent: parsed.intent,
        status_label: parsed.status_label,
        source: "email_reply",
        task_snapshot_before: before as unknown as Record<string, unknown>,
        task_updates_applied: taskUpdates,
      });

      if (insErr) {
        errors += 1;
        await admin.from("tasks").update(before as Record<string, unknown>).eq("id", raw.task_id).eq("user_id", raw.user_id);
        continue;
      }

      applied += 1;
    } catch (e) {
      console.warn("[follow-reply-ingest] row", raw.id, e);
      errors += 1;
    }
  }

  return { examined, applied, noopRecorded, skipped, errors };
}
