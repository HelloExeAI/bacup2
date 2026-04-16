import { NextResponse } from "next/server";
import { z } from "zod";

import { renderFollowupTemplate } from "@/lib/followups/renderTemplate";
import { sendGmailNewPlainMessage } from "@/lib/integrations/google/gmailSendNewPlain";
import { capturePostHogServerEvent } from "@/lib/posthog-server";
import { normalizeUserSettingsRow } from "@/modules/settings/normalizeUserSettings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    channel: z.enum(["email", "whatsapp", "slack"]),
    from_connected_account_id: z.string().uuid().optional(),
    message: z.string().min(1).max(5000),
    task_summaries: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1).max(400),
        }),
      )
      .min(1),
    task_assignments: z
      .array(
        z.object({
          task_id: z.string().min(1),
          recipients_raw: z.string(),
        }),
      )
      .min(1),
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

  const titleById = new Map(parsed.data.task_summaries.map((s) => [s.id, s.title]));
  const assignmentTaskIds = new Set(parsed.data.task_assignments.map((a) => a.task_id));

  for (const id of assignmentTaskIds) {
    if (!titleById.has(id)) {
      return NextResponse.json({ error: "missing_task_summary", details: id }, { status: 400 });
    }
  }

  /** recipient (normalized email) -> unique task ids */
  const byRecipient = new Map<string, Set<string>>();
  for (const a of parsed.data.task_assignments) {
    const tokens = parseRecipientTokens(a.recipients_raw).map(normalizeEmail);
    const emails = tokens.filter(isEmail);
    if (emails.length === 0) {
      return NextResponse.json(
        {
          error: "missing_recipient",
          details: `Task "${titleById.get(a.task_id) ?? a.task_id}" needs at least one valid email.`,
        },
        { status: 400 },
      );
    }
    for (const e of emails) {
      if (!byRecipient.has(e)) byRecipient.set(e, new Set());
      byRecipient.get(e)!.add(a.task_id);
    }
  }

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

  const results: Array<{ to: string; ok: boolean; error?: string; detail?: unknown; task_count?: number }> = [];

  for (const [to, idSet] of byRecipient) {
    const taskIds = Array.from(idSet);
    const titles = taskIds.map((id) => titleById.get(id)!).filter(Boolean);
    titles.sort((a, b) => a.localeCompare(b));
    const taskBullets = titles.map((t) => `- ${t}`).join("\n");
    const primaryTitle = titles[0] ?? "Follow up";
    const taskCount = String(titles.length);

    const vars = {
      user_message: userMessage,
      task_bullets: taskBullets,
      task_count: taskCount,
      primary_task_title: primaryTitle,
      recipient_greeting: recipientGreeting(to),
      recipient_email: to,
      sender_name: senderName,
    };

    const subject = renderFollowupTemplate(settings.followup_email_subject_template, vars).trim() || "Follow up";
    const textPlain = renderFollowupTemplate(settings.followup_email_body_template, vars).trim();

    const sendRes = await sendGmailNewPlainMessage({
      supabase,
      userId: user.id,
      accountId: acc.id,
      to,
      subject,
      textPlain,
    });

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
    task_assignment_rows: parsed.data.task_assignments.length,
    consolidated: true,
  });

  const allOk = failCount === 0;
  return NextResponse.json(
    {
      ok: allOk,
      channel: "email",
      from_account_email: acc.account_email,
      results,
    },
    { status: allOk ? 200 : 207 },
  );
}
