-- Capture who wrote a comment (user vs assignee).

alter table public.task_comments
  add column if not exists author_kind text not null default 'user'
    check (author_kind in ('user', 'assignee')),
  add column if not exists author_name text not null default '';

