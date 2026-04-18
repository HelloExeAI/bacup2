-- When the workspace "Automate Followups" bulk email send succeeds, we stamp tasks so the hub can hide them from the next local day and show history elsewhere.

alter table public.tasks
  add column if not exists automate_followup_sent_at timestamptz;

comment on column public.tasks.automate_followup_sent_at is
  'Set when a successful bulk follow-up email is sent from Workspace → Automate Followups; used for hub filtering and history.';

create index if not exists tasks_user_automate_followup_sent_at_idx
  on public.tasks (user_id, automate_followup_sent_at desc nulls last)
  where automate_followup_sent_at is not null;
