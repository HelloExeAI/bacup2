-- Scratchpad extraction pipeline: idempotent runs + extracted actions audit.

create table if not exists public.scratchpad_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  content_hash text not null,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  source text check (source in ('openai', 'fallback')),
  model text,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint scratchpad_extraction_runs_user_date_hash_unique
    unique (user_id, date, content_hash)
);

create index if not exists scratchpad_extraction_runs_user_created_idx
  on public.scratchpad_extraction_runs(user_id, created_at desc);

create table if not exists public.scratchpad_extracted_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.scratchpad_extraction_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null check (type in ('todo', 'followup', 'reminder')),
  due_date date,
  due_time text,
  assigned_to text not null default 'self',
  normalized_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists scratchpad_extracted_actions_run_idx
  on public.scratchpad_extracted_actions(run_id);

create index if not exists scratchpad_extracted_actions_user_key_idx
  on public.scratchpad_extracted_actions(user_id, normalized_key);

alter table public.tasks
  add column if not exists extraction_run_id uuid references public.scratchpad_extraction_runs(id) on delete set null;

create index if not exists tasks_extraction_run_id_idx
  on public.tasks(extraction_run_id);

-- RLS: users can only access their own extraction rows/actions.
alter table public.scratchpad_extraction_runs enable row level security;
drop policy if exists "Users can view their extraction runs" on public.scratchpad_extraction_runs;
create policy "Users can view their extraction runs"
on public.scratchpad_extraction_runs
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their extraction runs" on public.scratchpad_extraction_runs;
create policy "Users can insert their extraction runs"
on public.scratchpad_extraction_runs
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their extraction runs" on public.scratchpad_extraction_runs;
create policy "Users can update their extraction runs"
on public.scratchpad_extraction_runs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their extraction runs" on public.scratchpad_extraction_runs;
create policy "Users can delete their extraction runs"
on public.scratchpad_extraction_runs
for delete
using (auth.uid() = user_id);

alter table public.scratchpad_extracted_actions enable row level security;
drop policy if exists "Users can view their extracted actions" on public.scratchpad_extracted_actions;
create policy "Users can view their extracted actions"
on public.scratchpad_extracted_actions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their extracted actions" on public.scratchpad_extracted_actions;
create policy "Users can insert their extracted actions"
on public.scratchpad_extracted_actions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their extracted actions" on public.scratchpad_extracted_actions;
create policy "Users can update their extracted actions"
on public.scratchpad_extracted_actions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their extracted actions" on public.scratchpad_extracted_actions;
create policy "Users can delete their extracted actions"
on public.scratchpad_extracted_actions
for delete
using (auth.uid() = user_id);

