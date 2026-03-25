-- Fix event upsert: ensure ON CONFLICT target matches a unique constraint/index.

-- Replace partial unique index with a plain unique constraint.
drop index if exists public.events_unique_task;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_user_task_unique'
  ) then
    alter table public.events
      add constraint events_user_task_unique unique (user_id, linked_task_id);
  end if;
end $$;

-- Recreate sync function (same behavior) to use ON CONFLICT against the unique constraint.
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

