-- Recurring tasks: one series row + materialized instances (max one pending per series).

create table if not exists public.task_recurrence_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  type text not null check (type in ('todo', 'followup', 'reminder')),
  assigned_to text not null default 'self',
  recurrence_rule jsonb not null,
  anchor_due_date date not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  reminder_enabled boolean not null default false,
  reminder_time text,
  reminder_setup_status text not null default 'complete'
    check (reminder_setup_status in ('pending', 'complete', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_recurrence_series_user_status_idx
  on public.task_recurrence_series (user_id, status);

alter table public.tasks
  add column if not exists series_id uuid references public.task_recurrence_series(id) on delete cascade,
  add column if not exists recurrence_label text;

create unique index if not exists tasks_one_pending_per_series_idx
  on public.tasks (series_id)
  where series_id is not null and status = 'pending';

create index if not exists tasks_user_series_idx
  on public.tasks (user_id, series_id)
  where series_id is not null;

alter table public.tasks
  drop constraint if exists tasks_source_check;

alter table public.tasks
  add constraint tasks_source_check
  check (source in ('scratchpad', 'manual', 'ai', 'email', 'recurring'));

alter table public.task_recurrence_series enable row level security;

drop policy if exists "Users view own recurrence series" on public.task_recurrence_series;
create policy "Users view own recurrence series"
on public.task_recurrence_series
for select
using (auth.uid() = user_id);

drop policy if exists "Users insert own recurrence series" on public.task_recurrence_series;
create policy "Users insert own recurrence series"
on public.task_recurrence_series
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users update own recurrence series" on public.task_recurrence_series;
create policy "Users update own recurrence series"
on public.task_recurrence_series
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own recurrence series" on public.task_recurrence_series;
create policy "Users delete own recurrence series"
on public.task_recurrence_series
for delete
using (auth.uid() = user_id);
