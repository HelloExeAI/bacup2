/** Mirrors `src/modules/settings/types` for `/api/mobile/user/settings` JSON. */

export type BacupTierId = "solo_os" | "operator_os" | "executive_os";
export type BillingInterval = "monthly" | "yearly";
export type SubscriptionStatus = "active" | "trial" | "expired" | "canceled";
export type FollowupCommunicationChannel = "email" | "whatsapp" | "slack";
export type NotificationSoundId =
  | "none"
  | "notif_1"
  | "notif_2"
  | "notif_3"
  | "notif_4"
  | "notif_5"
  | "notif_6"
  | "notif_7"
  | "notif_8";
export type ClockDisplayFormat = "12h" | "24h";
export type ClockTimezoneSource = "device" | "profile" | "utc";

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
  followup_email_subject_template: string;
  followup_email_body_template: string;
  daily_briefing_notification_time: string | null;
  notification_sound: NotificationSoundId;
  event_reminders: boolean;
  team_chat_settings: Record<string, unknown>;
  billing_plan: string;
  subscription_tier: BacupTierId;
  billing_interval: BillingInterval;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  ask_bacup_addon: boolean;
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
  display_name?: string | null;
  created_at: string;
  provider_subject?: string | null;
  scopes?: string | null;
};

export type TeamMemberSummary = {
  id: string;
  member_user_id: string;
  display_name: string | null;
  status: string;
  can_view_dashboard_for_others: boolean;
  department: string | null;
};

export type SettingsPayload = {
  email: string | null;
  profile: {
    id: string;
    name: string | null;
    created_at: string | null;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    display_name: string | null;
    role: string;
    phone: string | null;
    phone_country_code: string | null;
    timezone: string | null;
    location: string | null;
    avatar_url: string | null;
  };
  settings: UserSettingsRow;
  connectedAccounts: ConnectedAccountRow[];
  teamMembers: TeamMemberSummary[];
};
