/**
 * Same rules as `src/modules/settings/normalizeUserSettings.ts` for mobile-only Supabase reads.
 */
import type {
  BacupTierId,
  BillingInterval,
  NotificationSoundId,
  SubscriptionStatus,
  UserSettingsRow,
} from "@/lib/settingsTypes";

const DEFAULT_FOLLOWUP_EMAIL_SUBJECT_TEMPLATE = "Quick follow-up — {{task_count}} open item(s)";

const DEFAULT_FOLLOWUP_EMAIL_BODY_TEMPLATE = `Hi {{recipient_greeting}},

Hope you're doing well — quick check-in from my side.

{{user_message}}

Here's what I'm hoping to get an update on:
{{task_bullets}}

Whenever you have a moment, could you reply with where things stand? If anything's blocked, call that out and I'll jump in.

{{assignee_update_sentence}}

Thanks so much,
{{sender_name}}`;

const SOUND_IDS: readonly string[] = [
  "none",
  "notif_1",
  "notif_2",
  "notif_3",
  "notif_4",
  "notif_5",
  "notif_6",
  "notif_7",
  "notif_8",
];

function coerceBacupTierId(raw: unknown): BacupTierId {
  if (raw === "operator_os" || raw === "executive_os") return raw;
  return "solo_os";
}

function coerceNotificationSoundId(v: unknown): NotificationSoundId {
  if (typeof v === "string" && SOUND_IDS.includes(v)) return v as NotificationSoundId;
  return "none";
}

function coerceClockDisplayFormat(v: unknown): "12h" | "24h" {
  return v === "24h" ? "24h" : "12h";
}

function coerceAssistantTone(v: unknown): UserSettingsRow["assistant_tone"] {
  if (v === "direct" || v === "balanced" || v === "detailed") return v;
  return "balanced";
}

function coerceBriefingStyle(v: unknown): UserSettingsRow["daily_briefing_style"] {
  return v === "ultra_concise" ? "ultra_concise" : "standard";
}

function coerceVoiceMode(v: unknown): UserSettingsRow["voice_input_mode"] {
  return v === "manual" ? "manual" : "auto";
}

function coerceSensitivity(v: unknown): UserSettingsRow["voice_sensitivity"] {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "high";
}

function coerceBool(v: unknown, defaultTrue = true): boolean {
  if (v === true || v === false) return v;
  return defaultTrue;
}

function coerceBillingInterval(v: unknown): BillingInterval {
  return v === "yearly" ? "yearly" : "monthly";
}

function coerceSubscriptionStatus(v: unknown): SubscriptionStatus {
  if (v === "trial" || v === "expired" || v === "canceled") return v;
  return "active";
}

function coerceFollowupCommunicationChannel(v: unknown): UserSettingsRow["followup_communication_channel"] {
  if (v === "email" || v === "whatsapp" || v === "slack") return v;
  return "email";
}

function coerceFollowupEmailSubject(v: unknown): string {
  if (typeof v !== "string" || !v.trim()) return DEFAULT_FOLLOWUP_EMAIL_SUBJECT_TEMPLATE;
  return v.trim().slice(0, 500);
}

function coerceFollowupEmailBody(v: unknown): string {
  if (typeof v !== "string" || !v.trim()) return DEFAULT_FOLLOWUP_EMAIL_BODY_TEMPLATE;
  return v.trim().slice(0, 20000);
}

function coerceDateDisplayFormat(v: unknown): UserSettingsRow["date_display_format"] {
  if (v === "dmy" || v === "mdy" || v === "dmy_yy" || v === "dmy_mon_yy") return v;
  return "ymd";
}

export function normalizeUserSettingsRow(userId: string, row: Record<string, unknown> | null | undefined): UserSettingsRow {
  const r = row ?? {};
  const updatedAt =
    typeof r.updated_at === "string" && r.updated_at.trim() ? r.updated_at : new Date().toISOString();

  let teamChat: Record<string, unknown> = {};
  const raw = r.team_chat_settings;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    teamChat = raw as Record<string, unknown>;
  }

  return {
    user_id: userId,
    preferred_language:
      typeof r.preferred_language === "string" && r.preferred_language.trim()
        ? r.preferred_language.trim()
        : "en",
    assistant_tone: coerceAssistantTone(r.assistant_tone),
    daily_briefing_style: coerceBriefingStyle(r.daily_briefing_style),
    voice_input_mode: coerceVoiceMode(r.voice_input_mode),
    voice_input_language:
      r.voice_input_language === null || r.voice_input_language === undefined
        ? null
        : String(r.voice_input_language),
    voice_output_language:
      typeof r.voice_output_language === "string" && r.voice_output_language.trim()
        ? r.voice_output_language.trim()
        : "en",
    noise_suppression: coerceBool(r.noise_suppression, true),
    auto_detect_speakers: coerceBool(r.auto_detect_speakers, true),
    live_transcription: coerceBool(r.live_transcription, true),
    voice_sensitivity: coerceSensitivity(r.voice_sensitivity),
    smart_reminders: coerceBool(r.smart_reminders, true),
    followup_nudges: coerceBool(r.followup_nudges, true),
    overdue_alerts: coerceBool(r.overdue_alerts, true),
    followup_communication_channel: coerceFollowupCommunicationChannel(r.followup_communication_channel),
    followup_email_subject_template: coerceFollowupEmailSubject(r.followup_email_subject_template),
    followup_email_body_template: coerceFollowupEmailBody(r.followup_email_body_template),
    daily_briefing_notification_time:
      typeof r.daily_briefing_notification_time === "string" && r.daily_briefing_notification_time.trim()
        ? r.daily_briefing_notification_time.trim()
        : null,
    notification_sound: coerceNotificationSoundId(r.notification_sound),
    event_reminders: coerceBool(r.event_reminders, true),
    team_chat_settings: teamChat,
    billing_plan:
      typeof r.billing_plan === "string" && r.billing_plan.trim() ? r.billing_plan.trim() : "solo",
    subscription_tier: coerceBacupTierId(r.subscription_tier),
    billing_interval: coerceBillingInterval(r.billing_interval),
    subscription_status: coerceSubscriptionStatus(r.subscription_status),
    current_period_end:
      typeof r.current_period_end === "string" && r.current_period_end.trim()
        ? r.current_period_end.trim()
        : null,
    ask_bacup_addon: coerceBool(r.ask_bacup_addon, false),
    date_display_format: coerceDateDisplayFormat(r.date_display_format),
    clock_display_format: coerceClockDisplayFormat(r.clock_display_format),
    clock_timezone_source: "device",
    updated_at: updatedAt,
  };
}
