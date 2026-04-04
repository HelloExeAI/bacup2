-- Google (and future) OAuth token storage — never expose these columns in public SELECT from the app.

alter table public.user_connected_accounts
  add column if not exists provider_subject text,
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists scopes text;

create index if not exists user_connected_accounts_google_sub_idx
  on public.user_connected_accounts (user_id, provider, provider_subject)
  where provider = 'google' and provider_subject is not null;

drop policy if exists "Users update own connected accounts" on public.user_connected_accounts;
create policy "Users update own connected accounts"
on public.user_connected_accounts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
