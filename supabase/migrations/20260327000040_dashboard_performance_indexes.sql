-- Dashboard performance: tasks + team visibility indexes and constraints.

-- Ensure due_time stays sortable as HH:MM (24h).
alter table public.tasks
  drop constraint if exists tasks_due_time_hhmm_check;
alter table public.tasks
  add constraint tasks_due_time_hhmm_check
  check (due_time ~ '^[0-2][0-9]:[0-5][0-9]$');

-- High-frequency dashboard filters (pending KPIs).
create index if not exists tasks_pending_due_idx
  on public.tasks (user_id, due_date, due_time)
  where status = 'pending';

create index if not exists tasks_pending_type_idx
  on public.tasks (user_id, type, due_date, due_time)
  where status = 'pending';

create index if not exists tasks_pending_source_idx
  on public.tasks (user_id, source, due_date, due_time)
  where status = 'pending';

-- For quick status splits and sorting newest.
create index if not exists tasks_user_status_created_idx
  on public.tasks (user_id, status, created_at desc);

-- For timesheet-style queries.
create index if not exists tasks_user_completed_at_idx
  on public.tasks (user_id, completed_at desc)
  where completed_at is not null;

-- Team visibility lookups.
create index if not exists team_member_permissions_view_others_idx
  on public.team_member_permissions (can_view_dashboard_for_others, team_member_id);

