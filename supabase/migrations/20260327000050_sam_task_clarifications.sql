-- SAM clarification queue for incomplete actionable tasks.

create table if not exists public.sam_task_clarifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  source text not null check (source in ('scratchpad', 'voice', 'meeting')),
  source_date date,
  raw_text text not null,
  rewritten_title text not null,
  missing_fields text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists sam_task_clarifications_task_unique
  on public.sam_task_clarifications(task_id);

create index if not exists sam_task_clarifications_user_status_created_idx
  on public.sam_task_clarifications(user_id, status, created_at desc);

create index if not exists sam_task_clarifications_user_source_date_idx
  on public.sam_task_clarifications(user_id, source_date, status);

alter table public.sam_task_clarifications enable row level security;

drop policy if exists "Users can view their SAM clarifications" on public.sam_task_clarifications;
create policy "Users can view their SAM clarifications"
on public.sam_task_clarifications
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their SAM clarifications" on public.sam_task_clarifications;
create policy "Users can insert their SAM clarifications"
on public.sam_task_clarifications
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their SAM clarifications" on public.sam_task_clarifications;
create policy "Users can update their SAM clarifications"
on public.sam_task_clarifications
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their SAM clarifications" on public.sam_task_clarifications;
create policy "Users can delete their SAM clarifications"
on public.sam_task_clarifications
for delete
using (auth.uid() = user_id);

