/** Defaults match `supabase/migrations/20260416140000_user_settings_followup_email_templates.sql` plus assignee link line. */

export const DEFAULT_FOLLOWUP_EMAIL_SUBJECT_TEMPLATE = "Quick follow-up — {{task_count}} open item(s)";

export const DEFAULT_FOLLOWUP_EMAIL_BODY_TEMPLATE = `Hi {{recipient_greeting}},

Hope you're doing well — quick check-in from my side.

{{user_message}}

Here's what I'm hoping to get an update on:
{{task_bullets}}

Whenever you have a moment, could you reply with where things stand? If anything's blocked, call that out and I'll jump in.

{{assignee_update_sentence}}

Thanks so much,
{{sender_name}}`;
