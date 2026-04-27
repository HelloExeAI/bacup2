import type { BacupTierId, BillingInterval } from "@/lib/billing/bacupTiers";
import type { NotificationSoundId } from "@/lib/notifications/notificationSounds";
import type { ClockDisplayFormat, ClockTimezoneSource } from "@/lib/time/clockDisplay";

export type SubscriptionStatus = "active" | "trial" | "expired" | "canceled";

export type FollowupCommunicationChannel = "email" | "whatsapp" | "slack";

export type UserSettingsRow = {
  user_id: string;
  preferred_language: string;
  assistant_tone: "direct" | "balanced" | "detailed";
  daily_briefing_style: "ultra_concise" | "standard";
  voice_input_mode: "auto" | "manual";
  voice_input_language: string | null;
  voice_output_language: string;
  noise_suppression: boolean;
  auto_detect_speakers: boolean;
  live_transcription: boolean;
  voice_sensitivity: "low" | "medium" | "high";
  smart_reminders: boolean;
  followup_nudges: boolean;
  overdue_alerts: boolean;
  followup_communication_channel: FollowupCommunicationChannel;
  /** Subject line for Automate Followups email; supports {{task_count}}, {{primary_task_title}}, etc. */
  followup_email_subject_template: string;
  /** Body for Automate Followups email; supports {{user_message}}, {{task_bullets}}, etc. */
  followup_email_body_template: string;
  daily_briefing_notification_time: string | null;
  notification_sound: NotificationSoundId;
  event_reminders: boolean;
  team_chat_settings: Record<string, unknown>;
  billing_plan: string;
  subscription_tier: BacupTierId;
  billing_interval: BillingInterval;
  subscription_status: SubscriptionStatus;
  /** ISO timestamp or null when not set (e.g. before first activation). */
  current_period_end: string | null;
  ask_bacup_addon: boolean;
  /** Task/date UI preference shared across web + mobile. */
  date_display_format: "ymd" | "dmy" | "mdy" | "dmy_yy" | "dmy_mon_yy";
  clock_display_format: ClockDisplayFormat;
  clock_timezone_source: ClockTimezoneSource;
  updated_at: string;
};

export type ConnectedAccountRow = {
  id: string;
  user_id: string;
  provider: "google" | "microsoft" | "imap";
  account_email: string;
  /** User-defined label in Settings → Integrations; UI falls back to account_email when empty. */
  display_name?: string | null;
  created_at: string;
  /** Google `sub`; safe to show in UI. */
  provider_subject?: string | null;
  /** Granted OAuth scopes (space-separated for Google). */
  scopes?: string | null;
};

export type TeamMemberSummary = {
  id: string;
  member_user_id: string;
  display_name: string | null;
  status: string;
  can_view_dashboard_for_others: boolean;
  /** Human-readable department (e.g. "Sales") when assigned in Team Setup. */
  department: string | null;
};

export type SettingsPayload = {
  email: string | null;
  profile: {
    id: string;
    /** Legacy full name; kept in sync with display name or legal name parts. */
    name: string | null;
    created_at: string | null;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    display_name: string | null;
    role: string;
    phone: string | null;
    /** E.164 prefix e.g. +1 */
    phone_country_code: string | null;
    timezone: string | null;
    location: string | null;
    avatar_url: string | null;
  };
  settings: UserSettingsRow;
  connectedAccounts: ConnectedAccountRow[];
  teamMembers: TeamMemberSummary[];
};
