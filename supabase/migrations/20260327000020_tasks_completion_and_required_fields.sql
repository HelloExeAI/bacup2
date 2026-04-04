-- Tasks: enforce planning fields and completion timestamp for timesheet workflows.

alter table public.tasks
  add column if not exists completed_at timestamptz;

update public.tasks
set
  due_date = coalesce(due_date, created_at::date, current_date),
  due_time = coalesce(nullif(trim(due_time), ''), '09:00'),
  assigned_to = coalesce(nullif(trim(assigned_to), ''), 'self')
where due_date is null or due_time is null or assigned_to is null or trim(assigned_to) = '';

update public.tasks
set completed_at = coalesce(completed_at, created_at, now())
where status = 'done' and completed_at is null;

alter table public.tasks
  alter column due_date set default current_date,
  alter column due_time set default '09:00',
  alter column assigned_to set default 'self';

alter table public.tasks
  alter column due_date set not null,
  alter column due_time set not null,
  alter column assigned_to set not null;

create index if not exists tasks_completed_at_idx
  on public.tasks(user_id, completed_at desc);

