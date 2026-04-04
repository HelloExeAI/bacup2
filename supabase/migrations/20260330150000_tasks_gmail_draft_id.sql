-- Gmail draft id for resuming compose from a task (Save draft flow).

alter table public.tasks
  add column if not exists gmail_draft_id text;

create index if not exists tasks_user_gmail_draft_idx
  on public.tasks (user_id, gmail_draft_id)
  where gmail_draft_id is not null;
