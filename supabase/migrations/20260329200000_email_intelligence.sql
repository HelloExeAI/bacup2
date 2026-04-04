-- Email-derived tasks + daily inbox notifications (bucketed by user local calendar day).

alter table public.tasks
  drop constraint if exists tasks_source_check;

alter table public.tasks
  add constraint tasks_source_check
  check (source in ('scratchpad', 'manual', 'ai', 'email'));

alter table public.tasks
  add column if not exists gmail_message_id text,
  add column if not exists gmail_thread_id text,
  add column if not exists connected_account_id uuid references public.user_connected_accounts(id) on delete set null;

create index if not exists tasks_gmail_message_idx
  on public.tasks (user_id, connected_account_id, gmail_message_id)
  where gmail_message_id is not null;

create table if not exists public.user_email_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_date date not null,
  summary text not null,
  subject text,
  connected_account_id uuid not null references public.user_connected_accounts(id) on delete cascade,
  thread_id text,
  message_id text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_email_notifications_user_message_unique unique (user_id, message_id)
);

create index if not exists user_email_notifications_user_bucket_idx
  on public.user_email_notifications (user_id, bucket_date desc, created_at desc);

create table if not exists public.gmail_message_ai_processed (
  user_id uuid not null references auth.users(id) on delete cascade,
  connected_account_id uuid not null references public.user_connected_accounts(id) on delete cascade,
  gmail_message_id text not null,
  processed_at timestamptz not null default now(),
  primary key (user_id, connected_account_id, gmail_message_id)
);

alter table public.user_email_notifications enable row level security;

drop policy if exists "Users select own email notifications" on public.user_email_notifications;
create policy "Users select own email notifications"
on public.user_email_notifications
for select
using (auth.uid() = user_id);

drop policy if exists "Users insert own email notifications" on public.user_email_notifications;
create policy "Users insert own email notifications"
on public.user_email_notifications
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users update own email notifications" on public.user_email_notifications;
create policy "Users update own email notifications"
on public.user_email_notifications
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own email notifications" on public.user_email_notifications;
create policy "Users delete own email notifications"
on public.user_email_notifications
for delete
using (auth.uid() = user_id);

alter table public.gmail_message_ai_processed enable row level security;

drop policy if exists "Users select own gmail ai processed" on public.gmail_message_ai_processed;
create policy "Users select own gmail ai processed"
on public.gmail_message_ai_processed
for select
using (auth.uid() = user_id);

drop policy if exists "Users insert own gmail ai processed" on public.gmail_message_ai_processed;
create policy "Users insert own gmail ai processed"
on public.gmail_message_ai_processed
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users delete own gmail ai processed" on public.gmail_message_ai_processed;
create policy "Users delete own gmail ai processed"
on public.gmail_message_ai_processed
for delete
using (auth.uid() = user_id);
