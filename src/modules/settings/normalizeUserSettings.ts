import { coerceBacupTierId, type BillingInterval } from "@/lib/billing/bacupTiers";
import { coerceNotificationSoundId } from "@/lib/notifications/notificationSounds";
import type { SubscriptionStatus, UserSettingsRow } from "@/modules/settings/types";
import { coerceClockDisplayFormat } from "@/lib/time/clockDisplay";

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
  return "medium";
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

/**
 * Merge a raw `user_settings` row (or null) with DB defaults so the UI always gets a complete object.
 */
export function normalizeUserSettingsRow(
  userId: string,
  row: Record<string, unknown> | null | undefined,
): UserSettingsRow {
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
    clock_display_format: coerceClockDisplayFormat(r.clock_display_format),
    clock_timezone_source: "device",
    updated_at: updatedAt,
  };
}
