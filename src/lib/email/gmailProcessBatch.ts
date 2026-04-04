import type { SupabaseClient, User } from "@supabase/supabase-js";

import { defaultDueTimeQuarterHour } from "@/lib/datetime/quarterHour";
import { assignSequentialDueTimesForToday } from "@/lib/scheduling/assignDueTimesFromCalendar";
import { calendarYmdInTimeZone } from "@/lib/email/calendarYmd";
import { ymdToday } from "@/modules/tasks/dayBriefing";
import {
  filterJunkTaskTitles,
  shouldSkipLowValueEmailStream,
} from "@/lib/email/emailJunkHeuristics";
import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { extractFromEmailWithOpenAI } from "@/lib/email/gmailAiExtract";
import { shouldSkipPromotionalProcessing } from "@/lib/email/gmailPromotionalSkip";
import {
  extractTextFromPayload,
  headerMap,
  type GmailApiPart,
} from "@/lib/integrations/google/gmailMessageParse";
import { getValidGoogleAccessToken, GoogleIntegrationError } from "@/lib/integrations/google/googleAccessToken";

export type GmailProcessTrigger =
  | "inbound"
  | "sent"
  | "reply"
  | "forward"
  | "reply_all";

export type GmailProcessBatchResult = {
  processed: number;
  tasksCreated: number;
  notificationsCreated: number;
  skippedPromotional: number;
  skippedJunk: number;
  /** Inbound / new-send / unspecified — AI pipeline not used */
  skippedNotReplyOrForward: number;
};

function allowAiForTrigger(trigger: GmailProcessTrigger | undefined): boolean {
  return trigger === "reply" || trigger === "reply_all" || trigger === "forward";
}

export async function runGmailProcessBatch(
  supabase: SupabaseClient,
  user: User,
  params: {
    accountId: string;
    messageIds: string[];
    accessToken?: string;
    /** Only reply / reply_all / forward run OpenAI extraction + email tasks. */
    trigger?: GmailProcessTrigger;
  },
): Promise<GmailProcessBatchResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const tz = typeof profile?.timezone === "string" ? profile.timezone : "UTC";
  const defaultDueYmd = calendarYmdInTimeZone(tz);

  const apiKey = process.env.OPENAI_API_KEY;

  let accessToken = params.accessToken;
  if (!accessToken) {
    try {
      const t = await getValidGoogleAccessToken(supabase, user.id, params.accountId);
      accessToken = t.accessToken;
    } catch (e) {
      if (e instanceof GoogleIntegrationError) throw e;
      throw e;
    }
  }

  const { data: already } = await supabase
    .from("gmail_message_ai_processed")
    .select("gmail_message_id")
    .eq("user_id", user.id)
    .eq("connected_account_id", params.accountId)
    .in("gmail_message_id", params.messageIds);

  const processedSet = new Set((already ?? []).map((r) => r.gmail_message_id as string));

  const { data: existingEmailTasks } = await supabase
    .from("tasks")
    .select("title,type,due_date,gmail_message_id")
    .eq("user_id", user.id)
    .eq("source", "email")
    .eq("status", "pending");

  const existingKeys = new Set(
    (existingEmailTasks ?? []).map(
      (t: { title?: string; type?: string; due_date?: string; gmail_message_id?: string }) =>
        `${t.gmail_message_id ?? ""}|${String(t.title ?? "").toLowerCase()}|${String(t.type ?? "")}|${String(t.due_date ?? "")}`,
    ),
  );

  let processed = 0;
  let tasksCreated = 0;
  const notificationsCreated = 0;
  let skippedPromotional = 0;
  let skippedJunk = 0;
  let skippedNotReplyOrForward = 0;

  const allowAi = allowAiForTrigger(params.trigger);

  for (const messageId of params.messageIds) {
    if (processedSet.has(messageId)) continue;

    const metaUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
    );
    metaUrl.searchParams.set("format", "full");

    const mRes = await fetch(metaUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const mJson = (await mRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!mRes.ok) {
      continue;
    }

    const labelIds = Array.isArray(mJson?.labelIds) ? (mJson.labelIds as string[]) : [];

    if (!allowAi) {
      skippedNotReplyOrForward += 1;
      const { error: procErr } = await supabase.from("gmail_message_ai_processed").insert({
        user_id: user.id,
        connected_account_id: params.accountId,
        gmail_message_id: messageId,
      });
      if (!procErr) processed += 1;
      continue;
    }

    const payload = mJson?.payload as
      | (GmailApiPart & { headers?: { name?: string; value?: string }[] })
      | undefined;
    const headers = headerMap(payload?.headers);
    const subject = headers["subject"] ?? "(no subject)";
    const fromLine = headers["from"] ?? "";
    const threadId = typeof mJson?.threadId === "string" ? mJson.threadId : null;
    const snippet = typeof mJson?.snippet === "string" ? mJson.snippet : "";

    const promo = shouldSkipPromotionalProcessing(labelIds, headers);
    if (promo.skip) {
      skippedPromotional += 1;
      const { error: procErr } = await supabase.from("gmail_message_ai_processed").insert({
        user_id: user.id,
        connected_account_id: params.accountId,
        gmail_message_id: messageId,
      });
      if (!procErr) processed += 1;
      continue;
    }

    const { text: bodyText } = extractTextFromPayload(payload ?? null);
    const text = bodyText.trim() || snippet;

    const junk = shouldSkipLowValueEmailStream({
      labelIds,
      subject,
      fromLine,
      bodyText: text,
      snippet,
      headers,
    });
    if (junk.skip) {
      skippedJunk += 1;
      const { error: procErr } = await supabase.from("gmail_message_ai_processed").insert({
        user_id: user.id,
        connected_account_id: params.accountId,
        gmail_message_id: messageId,
      });
      if (!procErr) processed += 1;
      continue;
    }

    /** Reply/forward only — no “new mail” tray summaries. */
    const wantInboundSummary = false;

    let taskPayload: Awaited<ReturnType<typeof extractFromEmailWithOpenAI>>["tasks"] = [];

    if (apiKey && text.length > 0) {
      const quota = await assertOpenAIQuotaAvailable(supabase, user.id, 3500);
      if (quota.ok) {
        try {
          const ai = await extractFromEmailWithOpenAI({
            apiKey,
            emailBody: text,
            subject,
            fromLine,
            defaultDueYmd,
            wantInboundSummary,
          });
          taskPayload = filterJunkTaskTitles(ai.tasks);
          if (ai.openaiTotalTokens && ai.openaiTotalTokens > 0) {
            await recordOpenAITokenUsage(supabase, user.id, ai.openaiTotalTokens);
          }
        } catch (e) {
          console.warn("[gmail/process-messages] openai", e);
        }
      }
    }

    const todayStr = ymdToday();
    const insertableTodayCount = taskPayload.filter((t) => {
      const key = `${messageId}|${t.title.toLowerCase()}|${t.type}|${String(t.due_date ?? "")}`;
      return !existingKeys.has(key) && (t.due_date ?? defaultDueYmd) === todayStr;
    }).length;
    const todaySlotPool =
      insertableTodayCount > 0
        ? await assignSequentialDueTimesForToday(supabase, user.id, todayStr, insertableTodayCount)
        : [];
    let todaySlotIdx = 0;

    for (const t of taskPayload) {
      const key = `${messageId}|${t.title.toLowerCase()}|${t.type}|${String(t.due_date ?? "")}`;
      if (existingKeys.has(key)) continue;
      const dueDate = t.due_date ?? defaultDueYmd;
      let dueTime = t.due_time ?? defaultDueTimeQuarterHour();
      if (dueDate === todayStr) {
        dueTime = todaySlotPool[todaySlotIdx] ?? dueTime;
        todaySlotIdx += 1;
      }
      const { data: ins, error: insErr } = await supabase
        .from("tasks")
        .insert({
          user_id: user.id,
          title: t.title,
          description: `From email: ${subject}`,
          due_date: dueDate,
          due_time: dueTime,
          type: t.type,
          assigned_to: t.assigned_to || "self",
          status: "pending",
          completed_at: null,
          source: "email",
          gmail_message_id: messageId,
          gmail_thread_id: threadId,
          connected_account_id: params.accountId,
        })
        .select("id")
        .maybeSingle();
      if (!insErr && ins?.id) {
        existingKeys.add(key);
        tasksCreated += 1;
      }
    }

    const { error: procErr } = await supabase.from("gmail_message_ai_processed").insert({
      user_id: user.id,
      connected_account_id: params.accountId,
      gmail_message_id: messageId,
    });
    if (!procErr) processed += 1;
  }

  return {
    processed,
    tasksCreated,
    notificationsCreated,
    skippedPromotional,
    skippedJunk,
    skippedNotReplyOrForward,
  };
}
