-- Yearly milestones (birthdays, anniversaries) shown on Timeline; user-managed.
-- External calendar sync (Google/Outlook write) can be layered later.

create table if not exists public.user_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('birthday', 'anniversary', 'other')),
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists user_milestones_user_idx on public.user_milestones (user_id);

alter table public.user_milestones enable row level security;

create policy "Users can view their milestones"
  on public.user_milestones for select
  using (auth.uid() = user_id);

create policy "Users can insert their milestones"
  on public.user_milestones for insert
  with check (auth.uid() = user_id);

create policy "Users can update their milestones"
  on public.user_milestones for update
  using (auth.uid() = user_id);

create policy "Users can delete their milestones"
  on public.user_milestones for delete
  using (auth.uid() = user_id);
