-- Auto-fill comment author name from the signed-in user's profile.

create or replace function public.set_task_comment_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dn text;
begin
  select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.name), ''), '')
  into dn
  from public.profiles p
  where p.id = new.user_id;

  if new.author_name is null or btrim(new.author_name) = '' then
    new.author_name := coalesce(nullif(dn, ''), 'User');
  end if;

  if new.author_kind is null or btrim(new.author_kind) = '' then
    new.author_kind := 'user';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_task_comments_author on public.task_comments;
create trigger trg_task_comments_author
before insert on public.task_comments
for each row
execute function public.set_task_comment_author();

