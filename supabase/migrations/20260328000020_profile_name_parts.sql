-- Split legal name + display name; backfill display_name from legacy name.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists display_name text;

update public.profiles
set display_name = name
where display_name is null
  and name is not null
  and btrim(name) <> '';
