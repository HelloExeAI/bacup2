-- Make comment inserts safer: default user_id to auth.uid().

alter table public.task_comments
  alter column user_id set default auth.uid();

