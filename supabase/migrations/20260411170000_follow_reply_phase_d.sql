-- Phase D: Inbound reply parsing (email) — audit trail + undo.

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
