-- Who completed / last edited a task (display names for audit and UI).

alter table public.tasks
  add column if not exists completed_by_name text,
  add column if not exists last_edited_by_name text;
