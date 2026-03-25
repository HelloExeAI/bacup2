-- Events table upgrades + task->event sync.

-- Ensure required columns exist (works with existing table).
alter table public.events
  add column if not exists time time,
  add column if not exists created_at timestamptz not null default now();

-- Ensure linked_task_id exists and references tasks.
alter table public.events
  add column if not exists linked_task_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_linked_task_id_fkey'
  ) then
    alter table public.events
      add constraint events_linked_task_id_fkey
      foreign key (linked_task_id) references public.tasks(id) on delete cascade;
  end if;
end $$;

-- Prevent duplicate events per task per user.
create unique index if not exists events_unique_task
  on public.events(user_id, linked_task_id)
  where linked_task_id is not null;

-- Sync function: upsert event when task has due_date, delete when not.
create or replace function public.sync_event_from_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.due_date is null) then
    delete from public.events
    where user_id = new.user_id and linked_task_id = new.id;
    return new;
  end if;

  insert into public.events (user_id, title, date, time, linked_task_id)
  values (new.user_id, new.title, new.due_date, new.due_time::time, new.id)
  on conflict (user_id, linked_task_id)
  do update set
    title = excluded.title,
    date = excluded.date,
    time = excluded.time;

  return new;
end;
$$;

drop trigger if exists on_task_upsert_sync_event on public.tasks;
create trigger on_task_upsert_sync_event
after insert or update of title, due_date, due_time on public.tasks
for each row execute procedure public.sync_event_from_task();

