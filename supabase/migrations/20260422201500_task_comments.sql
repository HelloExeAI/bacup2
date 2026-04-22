-- Task comments (sync to web + mobile via Supabase).

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_id_created_at_idx
  on public.task_comments (task_id, created_at desc);

alter table public.task_comments enable row level security;

-- Only allow comments for tasks the user owns (matches current tasks RLS).
drop policy if exists "Users can view their task comments" on public.task_comments;
create policy "Users can view their task comments"
on public.task_comments
for select
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their task comments" on public.task_comments;
create policy "Users can insert their task comments"
on public.task_comments
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their task comments" on public.task_comments;
create policy "Users can delete their task comments"
on public.task_comments
for delete
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and t.user_id = auth.uid()
  )
);

