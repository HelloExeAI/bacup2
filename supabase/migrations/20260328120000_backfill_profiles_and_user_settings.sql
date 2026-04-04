-- Ensure every auth user has a profiles row and a user_settings row (fixes legacy / pre-trigger accounts).

insert into public.profiles (id, name, role)
select
  u.id,
  nullif(trim(coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', '')), ''),
  'member'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

insert into public.user_settings (user_id)
select u.id
from auth.users u
where not exists (select 1 from public.user_settings s where s.user_id = u.id)
on conflict (user_id) do nothing;
