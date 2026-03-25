-- Add structured classification fields to tasks.

alter table public.tasks
  add column if not exists type text not null default 'todo' check (type in ('todo', 'followup', 'reminder')),
  add column if not exists assigned_to text not null default 'self',
  add column if not exists due_time text;

