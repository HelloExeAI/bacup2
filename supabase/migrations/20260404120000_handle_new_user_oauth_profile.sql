-- Enrich profiles on signup from OAuth / SAML user metadata (Google, Azure, etc.).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text;
  v_last text;
  v_full text;
  v_avatar text;
  v_display text;
begin
  v_first := nullif(trim(coalesce(new.raw_user_meta_data->>'given_name', '')), '');
  v_last := nullif(trim(coalesce(new.raw_user_meta_data->>'family_name', '')), '');
  v_full := nullif(trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    ''
  )), '');
  v_avatar := nullif(trim(coalesce(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture',
    ''
  )), '');
  v_display := coalesce(v_full, nullif(trim(new.raw_user_meta_data->>'name'), ''));

  insert into public.profiles (id, name, role, first_name, last_name, display_name, avatar_url)
  values (
    new.id,
    coalesce(v_display, v_full),
    'member',
    v_first,
    v_last,
    v_display,
    v_avatar
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
