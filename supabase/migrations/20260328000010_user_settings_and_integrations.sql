-- Account fields on profiles + app preferences + OAuth account links (metadata only).

alter table public.profiles
  add column if not exists phone text,
  add column if not exists timezone text default 'UTC',
  add column if not exists location text,
  add column if not exists avatar_url text;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_language text not null default 'en',
  assistant_tone text not null default 'balanced'
    check (assistant_tone in ('direct', 'balanced', 'detailed')),
  daily_briefing_style text not null default 'standard'
    check (daily_briefing_style in ('ultra_concise', 'standard')),
  voice_input_mode text not null default 'auto'
    check (voice_input_mode in ('auto', 'manual')),
  voice_input_language text,
  voice_output_language text not null default 'en',
  noise_suppression boolean not null default true,
  auto_detect_speakers boolean not null default true,
  live_transcription boolean not null default true,
  voice_sensitivity text not null default 'medium'
    check (voice_sensitivity in ('low', 'medium', 'high')),
  smart_reminders boolean not null default true,
  followup_nudges boolean not null default true,
  overdue_alerts boolean not null default true,
  daily_briefing_notification_time text,
  event_reminders boolean not null default true,
  team_chat_settings jsonb not null default '{}'::jsonb,
  billing_plan text not null default 'free',
  updated_at timestamptz not null default now()
);

create index if not exists user_settings_updated_idx on public.user_settings(updated_at desc);

create table if not exists public.user_connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  account_email text not null,
  created_at timestamptz not null default now(),
  unique (user_id, provider, account_email)
);

create index if not exists user_connected_accounts_user_idx
  on public.user_connected_accounts(user_id, provider);

alter table public.user_settings enable row level security;
alter table public.user_connected_accounts enable row level security;

drop policy if exists "Users manage own settings row" on public.user_settings;
create policy "Users manage own settings row"
on public.user_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users view own connected accounts" on public.user_connected_accounts;
create policy "Users view own connected accounts"
on public.user_connected_accounts
for select
using (auth.uid() = user_id);

drop policy if exists "Users insert own connected accounts" on public.user_connected_accounts;
create policy "Users insert own connected accounts"
on public.user_connected_accounts
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users delete own connected accounts" on public.user_connected_accounts;
create policy "Users delete own connected accounts"
on public.user_connected_accounts
for delete
using (auth.uid() = user_id);

-- New signups get a settings row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'name', ''),
    'member'
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Backfill settings for existing users (idempotent).
insert into public.user_settings (user_id)
select id from public.profiles
on conflict (user_id) do nothing;
