-- Phase D: Inbound reply parsing (email) — audit trail + undo.
-- Bootstraps Phase C follow objects when missing (same DDL as 20260411140000_follow_automation_phase_c.sql) so this file is safe if Phase C was skipped.

create table if not exists public.workspace_follow_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  automation_enabled boolean not null default false,
  send_mode text not null default 'manual_review'
    check (send_mode in ('manual_review', 'auto_send')),
  max_nudges_per_day integer not null default 20
    check (max_nudges_per_day >= 1 and max_nudges_per_day <= 500),
  max_nudges_per_task integer not null default 12
    check (max_nudges_per_task >= 1 and max_nudges_per_task <= 100),
  quiet_hours_start time without time zone,
  quiet_hours_end time without time zone,
  default_response_hours numeric(8, 2) not null default 2
    check (default_response_hours >= 0.25 and default_response_hours <= 720),
  reminder_interval_minutes integer not null default 120
    check (reminder_interval_minutes >= 5 and reminder_interval_minutes <= 10080),
  from_connected_account_id uuid references public.user_connected_accounts(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.task_follow_subscription (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  enabled boolean not null default true,
  assignee_email text not null,
  response_deadline_at timestamptz not null,
  next_reminder_at timestamptz not null,
  last_outbound_at timestamptz,
  total_outbounds integer not null default 0,
  nudges_day date,
  nudges_count integer not null default 0,
  reminder_interval_minutes integer not null default 120,
  created_at timestamptz not null default now(),
  unique (user_id, task_id)
);

create index if not exists task_follow_subscription_next_idx
  on public.task_follow_subscription (next_reminder_at)
  where enabled = true;

create table if not exists public.follow_outbound_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.task_follow_subscription(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  connected_account_id uuid references public.user_connected_accounts(id) on delete set null,
  channel text not null default 'email',
  to_email text not null,
  subject text not null,
  body_plain text not null,
  status text not null
    check (status in ('pending_approval', 'sent', 'failed', 'skipped_quiet', 'skipped_cap', 'cancelled')),
  error text,
  rule_snapshot jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists follow_outbound_log_user_created_idx
  on public.follow_outbound_log (user_id, created_at desc);

create index if not exists follow_outbound_log_pending_idx
  on public.follow_outbound_log (user_id, status)
  where status = 'pending_approval';

alter table public.workspace_follow_settings enable row level security;
alter table public.task_follow_subscription enable row level security;
alter table public.follow_outbound_log enable row level security;

drop policy if exists "Users manage own follow settings" on public.workspace_follow_settings;
create policy "Users manage own follow settings"
  on public.workspace_follow_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own task follow subscriptions" on public.task_follow_subscription;
create policy "Users manage own task follow subscriptions"
  on public.task_follow_subscription
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users view own follow outbound log" on public.follow_outbound_log;
create policy "Users view own follow outbound log"
  on public.follow_outbound_log
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own follow outbound log" on public.follow_outbound_log;
create policy "Users insert own follow outbound log"
  on public.follow_outbound_log
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own follow outbound log" on public.follow_outbound_log;
create policy "Users update own follow outbound log"
  on public.follow_outbound_log
  for update
  using (auth.uid() = user_id);

alter table public.follow_outbound_log
  add column if not exists gmail_message_id text,
  add column if not exists gmail_thread_id text,
  add column if not exists gmail_internal_ms bigint;

alter table public.workspace_follow_settings
  add column if not exists reply_parse_enabled boolean not null default true;

create table if not exists public.follow_reply_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  subscription_id uuid references public.task_follow_subscription(id) on delete set null,
  outbound_log_id uuid references public.follow_outbound_log(id) on delete set null,
  gmail_message_id text not null,
  gmail_thread_id text not null,
  from_email_preview text,
  raw_text text not null,
  intent text not null check (intent in ('done', 'reassigned', 'in_progress', 'noop')),
  task_snapshot_before jsonb not null,
  task_updates_applied jsonb,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, gmail_message_id)
);

create index if not exists follow_reply_events_user_created_idx
  on public.follow_reply_events (user_id, created_at desc);

alter table public.follow_reply_events enable row level security;

drop policy if exists "Users select own follow reply events" on public.follow_reply_events;
create policy "Users select own follow reply events"
  on public.follow_reply_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users update own follow reply events" on public.follow_reply_events;
create policy "Users update own follow reply events"
  on public.follow_reply_events
  for update
  using (auth.uid() = user_id);
