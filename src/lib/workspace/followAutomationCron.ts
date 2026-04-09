import type { SupabaseClient } from "@supabase/supabase-js";

import { sendGmailNewPlainMessage } from "@/lib/integrations/google/gmailSendNewPlain";
import {
  buildFollowNudgeEmail,
  isQuietHours,
  utcDayStart,
  type FollowRuleSnapshot,
} from "@/lib/workspace/followAutomation";

type SettingsRow = {
  automation_enabled: boolean;
  send_mode: "manual_review" | "auto_send";
  max_nudges_per_day: number;
  max_nudges_per_task: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  default_response_hours: number;
  reminder_interval_minutes: number;
  from_connected_account_id: string | null;
};

type SubRow = {
  id: string;
  user_id: string;
  task_id: string;
  assignee_email: string;
  response_deadline_at: string;
  next_reminder_at: string;
  total_outbounds: number;
  nudges_day: string | null;
  nudges_count: number;
  reminder_interval_minutes: number;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
};

export async function runFollowAutomationTick(admin: SupabaseClient): Promise<{
  examined: number;
  queued: number;
  sent: number;
  skipped: number;
  errors: number;
}> {
  const now = new Date();
  let examined = 0;
  let queued = 0;
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const { data: subs, error: subErr } = await admin
    .from("task_follow_subscription")
    .select(
      "id,user_id,task_id,assignee_email,response_deadline_at,next_reminder_at,total_outbounds,nudges_day,nudges_count,reminder_interval_minutes,enabled",
    )
    .eq("enabled", true)
    .lte("next_reminder_at", now.toISOString())
    .limit(200);

  if (subErr || !subs?.length) {
    return { examined: 0, queued: 0, sent: 0, skipped: subErr ? 0 : 0, errors: subErr ? 1 : 0 };
  }

  for (const raw of subs as SubRow[]) {
    examined += 1;
    const sub = raw;
    const { data: task } = await admin
      .from("tasks")
      .select("id,title,status")
      .eq("id", sub.task_id)
      .maybeSingle();

    const t = task as TaskRow | null;
    if (!t || t.status !== "pending") {
      await admin.from("task_follow_subscription").update({ enabled: false }).eq("id", sub.id);
      skipped += 1;
      continue;
    }

    const deadline = new Date(sub.response_deadline_at);
    if (Number.isNaN(deadline.getTime())) {
      errors += 1;
      continue;
    }

    const { data: settings } = await admin
      .from("workspace_follow_settings")
      .select("*")
      .eq("user_id", sub.user_id)
      .maybeSingle();

    const st = settings as SettingsRow | null;
    if (!st?.automation_enabled) {
      skipped += 1;
      continue;
    }

    if (!st.from_connected_account_id) {
      skipped += 1;
      continue;
    }

    if (sub.total_outbounds >= st.max_nudges_per_task) {
      await admin.from("task_follow_subscription").update({ enabled: false }).eq("id", sub.id);
      skipped += 1;
      continue;
    }

    const { data: pending } = await admin
      .from("follow_outbound_log")
      .select("id")
      .eq("subscription_id", sub.id)
      .eq("status", "pending_approval")
      .limit(1)
      .maybeSingle();

    if (pending?.id) {
      const push = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      await admin.from("task_follow_subscription").update({ next_reminder_at: push }).eq("id", sub.id);
      skipped += 1;
      continue;
    }

    const { data: prof } = await admin.from("profiles").select("timezone,display_name,name").eq("id", sub.user_id).maybeSingle();
    const tz =
      typeof prof?.timezone === "string" && prof.timezone.trim() ? prof.timezone.trim() : "UTC";
    const founderLabel =
      [prof?.display_name, prof?.name].find((x) => typeof x === "string" && x.trim())?.trim() || "Founder";

    if (isQuietHours(now, tz, st.quiet_hours_start, st.quiet_hours_end)) {
      const snap: FollowRuleSnapshot = {
        send_mode: st.send_mode,
        quiet_skipped: true,
        reminder_interval_minutes: st.reminder_interval_minutes,
      };
      await admin.from("follow_outbound_log").insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        task_id: sub.task_id,
        connected_account_id: st.from_connected_account_id,
        channel: "email",
        to_email: sub.assignee_email,
        subject: "(skipped — quiet hours)",
        body_plain: "(skipped — quiet hours)",
        status: "skipped_quiet",
        rule_snapshot: snap,
      });
      const next = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
      await admin.from("task_follow_subscription").update({ next_reminder_at: next }).eq("id", sub.id);
      skipped += 1;
      continue;
    }

    const dayStart = utcDayStart(now).toISOString();
    const { count: dayCount } = await admin
      .from("follow_outbound_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", sub.user_id)
      .gte("created_at", dayStart)
      .in("status", ["sent", "pending_approval"]);

    if (typeof dayCount === "number" && dayCount >= st.max_nudges_per_day) {
      const snap: FollowRuleSnapshot = {
        send_mode: st.send_mode,
        cap_skipped: true,
        reminder_interval_minutes: st.reminder_interval_minutes,
      };
      await admin.from("follow_outbound_log").insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        task_id: sub.task_id,
        connected_account_id: st.from_connected_account_id,
        channel: "email",
        to_email: sub.assignee_email,
        subject: "(skipped — daily cap)",
        body_plain: "(skipped — daily cap)",
        status: "skipped_cap",
        rule_snapshot: snap,
      });
      const next = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      await admin.from("task_follow_subscription").update({ next_reminder_at: next }).eq("id", sub.id);
      skipped += 1;
      continue;
    }

    const urgent = now.getTime() > deadline.getTime();
    const { subject, body } = buildFollowNudgeEmail({
      taskTitle: t.title,
      founderLabel,
      isUrgent: urgent,
    });

    const interval = Math.max(5, sub.reminder_interval_minutes || st.reminder_interval_minutes);
    const nextFire = new Date(now.getTime() + interval * 60 * 1000);
    const snap: FollowRuleSnapshot = {
      send_mode: st.send_mode,
      reminder_interval_minutes: interval,
    };

    if (st.send_mode === "manual_review") {
      await admin.from("follow_outbound_log").insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        task_id: sub.task_id,
        connected_account_id: st.from_connected_account_id,
        channel: "email",
        to_email: sub.assignee_email,
        subject,
        body_plain: body,
        status: "pending_approval",
        rule_snapshot: snap,
      });
      queued += 1;
      await admin
        .from("task_follow_subscription")
        .update({ next_reminder_at: nextFire.toISOString() })
        .eq("id", sub.id);
      continue;
    }

    const sendRes = await sendGmailNewPlainMessage({
        supabase: admin,
        userId: sub.user_id,
        accountId: st.from_connected_account_id,
        to: sub.assignee_email,
        subject,
        textPlain: body,
      });

      if (!sendRes.ok) {
        await admin.from("follow_outbound_log").insert({
          user_id: sub.user_id,
          subscription_id: sub.id,
          task_id: sub.task_id,
          connected_account_id: st.from_connected_account_id,
          channel: "email",
          to_email: sub.assignee_email,
          subject,
          body_plain: body,
          status: "failed",
          error: sendRes.error,
          rule_snapshot: snap,
        });
        errors += 1;
        const next = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
        await admin.from("task_follow_subscription").update({ next_reminder_at: next }).eq("id", sub.id);
        continue;
      }

      await admin.from("follow_outbound_log").insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        task_id: sub.task_id,
        connected_account_id: st.from_connected_account_id,
        channel: "email",
        to_email: sub.assignee_email,
        subject,
        body_plain: body,
        status: "sent",
        rule_snapshot: snap,
        sent_at: now.toISOString(),
        gmail_message_id: sendRes.messageId ?? null,
        gmail_thread_id: sendRes.threadId ?? null,
      });
      sent += 1;

    const todayStr = now.toISOString().slice(0, 10);
    const nudgesDay = sub.nudges_day;
    let nudgesCount = sub.nudges_count;
    if (nudgesDay !== todayStr) {
      nudgesCount = 0;
    }
    nudgesCount += 1;

    await admin
      .from("task_follow_subscription")
      .update({
        last_outbound_at: now.toISOString(),
        total_outbounds: sub.total_outbounds + 1,
        nudges_day: todayStr,
        nudges_count: nudgesCount,
        next_reminder_at: nextFire.toISOString(),
      })
      .eq("id", sub.id);
  }

  return { examined, queued, sent, skipped, errors };
}
