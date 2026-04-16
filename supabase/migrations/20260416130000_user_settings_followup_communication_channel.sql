-- Add default communication channel for Automate Followups.

alter table public.user_settings
  add column if not exists followup_communication_channel text not null default 'email'
    check (followup_communication_channel in ('email', 'whatsapp', 'slack'));

comment on column public.user_settings.followup_communication_channel is
  'Default channel for Automate Followups (email | whatsapp | slack).';

