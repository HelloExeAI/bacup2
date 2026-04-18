import { NextResponse } from "next/server";
import { z } from "zod";

import { ASSIGNEE_FOLLOWUP_TOKEN_TTL_MS, mintAssigneeFollowupToken } from "@/lib/followups/assigneeFollowupToken";
import { renderFollowupTemplate } from "@/lib/followups/renderTemplate";
import { sendGmailNewPlainMessage } from "@/lib/integrations/google/gmailSendNewPlain";
import { defaultSiteOrigin } from "@/lib/site";
import { capturePostHogServerEvent } from "@/lib/posthog-server";
import { normalizeUserSettingsRow } from "@/modules/settings/normalizeUserSettings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Task } from "@/store/taskStore";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    channel: z.enum(["email", "whatsapp", "slack"]),
    from_connected_account_id: z.string().uuid().optional(),
    message: z.string().min(1).max(5000),
    task_ids: z.array(z.string().uuid()).min(1),
    to_raw: z.string(),
    cc_raw: z.string().optional(),
  })
  .strict();

function parseRecipientTokens(raw: string): string[] {
  return raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function recipientGreeting(email: string): string {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? "";
  if (first.length >= 2) return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return "there";
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.channel !== "email") {
    return NextResponse.json(
      { error: "channel_not_configured", details: "Only Email is currently supported." },
      { status: 409 },
    );
  }

  const fromAccountId = parsed.data.from_connected_account_id;
  if (!fromAccountId) {
    return NextResponse.json(
      { error: "missing_sender_account", details: "Pick a connected Email account in the Follow up modal." },
      { status: 400 },
    );
  }

  const { data: acc } = await supabase
    .from("user_connected_accounts")
    .select("id,provider,account_email")
    .eq("user_id", user.id)
    .eq("id", fromAccountId)
    .maybeSingle();

  if (!acc || acc.provider !== "google") {
    return NextResponse.json(
      { error: "invalid_sender_account", details: "Sender must be a Google account you connected." },
      { status: 400 },
    );
  }

  const uniqueIds = Array.from(new Set(parsed.data.task_ids));

  const { data: taskRows, error: tasksErr } = await supabase
    .from("tasks")
    .select("id,title,status")
    .eq("user_id", user.id)
    .in("id", uniqueIds);

  if (tasksErr) {
    return NextResponse.json({ error: "task_load_failed", details: tasksErr.message }, { status: 500 });
  }

  const rows = taskRows ?? [];
  if (rows.length !== uniqueIds.length) {
    return NextResponse.json(
      { error: "invalid_tasks", details: "One or more tasks were not found or do not belong to you." },
      { status: 400 },
    );
  }

  for (const r of rows) {
    if (r.status !== "pending") {
      return NextResponse.json(
        {
          error: "task_not_pending",
          details: `Task "${String(r.title ?? r.id)}" is not open for follow-up.`,
        },
        { status: 400 },
      );
    }
  }

  const titleById = new Map(rows.map((r) => [r.id as string, String(r.title ?? "").trim() || "Follow up"]));

  const toTokens = parseRecipientTokens(parsed.data.to_raw).map(normalizeEmail);
  const toEmails = toTokens.filter(isEmail);
  if (toEmails.length === 0) {
    return NextResponse.json(
      { error: "missing_to", details: "Enter exactly one valid email in To." },
      { status: 400 },
    );
  }
  if (toEmails.length > 1) {
    return NextResponse.json(
      {
        error: "multiple_to_emails",
        details: "Enter only one email in To (the primary assignee for the update link). Add others in Cc.",
      },
      { status: 400 },
    );
  }
  const to = toEmails[0]!;

  const ccRaw = (parsed.data.cc_raw ?? "").trim();
  const ccTokens = ccRaw ? parseRecipientTokens(ccRaw).map(normalizeEmail) : [];
  const ccEmails: string[] = [];
  for (const t of ccTokens) {
    if (!isEmail(t)) {
      return NextResponse.json(
        { error: "invalid_cc", details: `Cc contains an invalid email: ${t.slice(0, 80)}` },
        { status: 400 },
      );
    }
    if (t === to) continue;
    if (!ccEmails.includes(t)) ccEmails.push(t);
  }
  const ccHeader = ccEmails.length > 0 ? ccEmails.join(", ") : undefined;

  const taskIds = [...uniqueIds];
  const titles = taskIds.map((id) => titleById.get(id)!).filter(Boolean);
  titles.sort((a, b) => a.localeCompare(b));
  const taskBullets = titles.map((t) => `- ${t}`).join("\n");
  const primaryTitle = titles[0] ?? "Follow up";
  const taskCount = String(titles.length);

  const { data: settingsRaw } = await supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle();
  const settings = normalizeUserSettingsRow(user.id, settingsRaw as Record<string, unknown> | null | undefined);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,first_name,last_name,name")
    .eq("id", user.id)
    .maybeSingle();

  const senderName = (() => {
    const d = profile?.display_name?.trim();
    if (d) return d;
    const fn = profile?.first_name?.trim() ?? "";
    const ln = profile?.last_name?.trim() ?? "";
    if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
    const n = profile?.name?.trim();
    if (n) return n;
    return user.email?.split("@")[0] ?? "Me";
  })();

  const userMessage = parsed.data.message.trim();

  let assignee_update_url = "";
  const { token: followupToken, tokenHash } = mintAssigneeFollowupToken();
  const { error: tokErr } = await supabase.from("assignee_followup_tokens").insert({
    owner_user_id: user.id,
    assignee_email: to,
    task_ids: taskIds,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + ASSIGNEE_FOLLOWUP_TOKEN_TTL_MS).toISOString(),
  });
  if (!tokErr) {
    assignee_update_url = `${defaultSiteOrigin()}/a/f/${encodeURIComponent(followupToken)}`;
  }

  const assignee_update_sentence = assignee_update_url
    ? `You can also update status here (no login): ${assignee_update_url}`
    : "";

  const vars = {
    user_message: userMessage,
    task_bullets: taskBullets,
    task_count: taskCount,
    primary_task_title: primaryTitle,
    recipient_greeting: recipientGreeting(to),
    recipient_email: to,
    sender_name: senderName,
    assignee_update_url,
    assignee_update_sentence,
  };

  const subject = renderFollowupTemplate(settings.followup_email_subject_template, vars).trim() || "Follow up";
  const textPlain = renderFollowupTemplate(settings.followup_email_body_template, vars)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const sendRes = await sendGmailNewPlainMessage({
    supabase,
    userId: user.id,
    accountId: acc.id,
    to,
    ...(ccHeader ? { cc: ccHeader } : {}),
    subject,
    textPlain,
  });

  const results: Array<{ to: string; ok: boolean; error?: string; detail?: unknown; task_count?: number }> = [];
  if (sendRes.ok) {
    results.push({ to, ok: true, task_count: titles.length });
  } else {
    results.push({
      to,
      ok: false,
      error: sendRes.error,
      detail: "detail" in sendRes ? sendRes.detail : undefined,
      task_count: titles.length,
    });
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  void capturePostHogServerEvent(user.id, "automate_followups_send", {
    channel: "email",
    from_provider: acc.provider,
    from_account_id: acc.id,
    unique_recipients: results.length,
    ok_count: okCount,
    fail_count: failCount,
    task_count: taskIds.length,
    consolidated: true,
    cc_count: ccEmails.length,
  });

  const allOk = failCount === 0;
  let updated_tasks: Task[] | undefined;
  if (allOk) {
    const nowIso = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("tasks")
      .update({ automate_followup_sent_at: nowIso })
      .eq("user_id", user.id)
      .in("id", taskIds);
    if (upErr) {
      return NextResponse.json(
        { error: "stamp_sent_failed", details: upErr.message, results },
        { status: 500 },
      );
    }
    const { data: refreshed } = await supabase.from("tasks").select("*").eq("user_id", user.id).in("id", taskIds);
    updated_tasks = (refreshed ?? []) as Task[];
  }

  return NextResponse.json(
    {
      ok: allOk,
      channel: "email",
      from_account_email: acc.account_email,
      results,
      ...(updated_tasks ? { updated_tasks } : {}),
    },
    { status: allOk ? 200 : 207 },
  );
}
