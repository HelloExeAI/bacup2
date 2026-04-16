-- Align DB default body template with app default (assignee link sentence).
-- Also ensures columns exist if 20260416140000_user_settings_followup_email_templates.sql was not applied yet.

alter table public.user_settings
  add column if not exists followup_email_subject_template text not null default $$Quick follow-up — {{task_count}} open item(s)$$;

alter table public.user_settings
  add column if not exists followup_email_body_template text not null default $$Hi {{recipient_greeting}},

Hope you're doing well — quick check-in from my side.

{{user_message}}

Here's what I'm hoping to get an update on:
{{task_bullets}}

Whenever you have a moment, could you reply with where things stand? If anything's blocked, call that out and I'll jump in.

{{assignee_update_sentence}}

Thanks so much,
{{sender_name}}$$;

alter table public.user_settings
  alter column followup_email_body_template set default $$Hi {{recipient_greeting}},

Hope you're doing well — quick check-in from my side.

{{user_message}}

Here's what I'm hoping to get an update on:
{{task_bullets}}

Whenever you have a moment, could you reply with where things stand? If anything's blocked, call that out and I'll jump in.

{{assignee_update_sentence}}

Thanks so much,
{{sender_name}}$$;

comment on column public.user_settings.followup_email_subject_template is
  'Subject template for Automate Followups email; placeholders: {{task_count}}, {{primary_task_title}}, {{recipient_email}}, {{sender_name}}.';
comment on column public.user_settings.followup_email_body_template is
  'Body template for Automate Followups email; placeholders: {{user_message}}, {{task_bullets}}, {{recipient_greeting}}, {{recipient_email}}, {{task_count}}, {{primary_task_title}}, {{sender_name}}, {{assignee_update_url}}, {{assignee_update_sentence}}.';
