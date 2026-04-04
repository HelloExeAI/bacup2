-- AI usage (OpenAI tokens + Deepgram seconds), rollover add-on balances, Ask Bacup chat history.
-- Plan limits are enforced in SQL RPCs (keep in sync with src/lib/billing/planCatalog.ts).

-- ---------------------------------------------------------------------------
-- Usage per calendar month (UTC YYYY-MM in period_key)
-- ---------------------------------------------------------------------------
create table if not exists public.user_ai_usage_periods (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_key text not null,
  openai_tokens bigint not null default 0 check (openai_tokens >= 0),
  deepgram_seconds bigint not null default 0 check (deepgram_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_key)
);

create index if not exists user_ai_usage_periods_user_idx
  on public.user_ai_usage_periods (user_id, period_key desc);

-- ---------------------------------------------------------------------------
-- Rollover add-on balances (purchased packs; not reset monthly)
-- ---------------------------------------------------------------------------
create table if not exists public.user_ai_addon_balance (
  user_id uuid primary key references auth.users (id) on delete cascade,
  openai_tokens bigint not null default 0 check (openai_tokens >= 0),
  deepgram_seconds bigint not null default 0 check (deepgram_seconds >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ask Bacup threads + messages
-- ---------------------------------------------------------------------------
create table if not exists public.ask_bacup_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ask_bacup_threads_user_updated_idx
  on public.ask_bacup_threads (user_id, updated_at desc);

create table if not exists public.ask_bacup_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ask_bacup_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ask_bacup_messages_thread_created_idx
  on public.ask_bacup_messages (thread_id, created_at asc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_ai_usage_periods enable row level security;
drop policy if exists "Users read own ai usage periods" on public.user_ai_usage_periods;
create policy "Users read own ai usage periods"
  on public.user_ai_usage_periods for select
  using (auth.uid() = user_id);

alter table public.user_ai_addon_balance enable row level security;
drop policy if exists "Users read own ai addon balance" on public.user_ai_addon_balance;
create policy "Users read own ai addon balance"
  on public.user_ai_addon_balance for select
  using (auth.uid() = user_id);

alter table public.ask_bacup_threads enable row level security;
drop policy if exists "Users manage own ask_bacup threads" on public.ask_bacup_threads;
create policy "Users manage own ask_bacup threads"
  on public.ask_bacup_threads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.ask_bacup_messages enable row level security;
drop policy if exists "Users manage own ask_bacup messages" on public.ask_bacup_messages;
create policy "Users manage own ask_bacup messages"
  on public.ask_bacup_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Internal plan limits (mirror planCatalog.ts)
-- ---------------------------------------------------------------------------
create or replace function public._ai_plan_openai_limit(plan text)
returns bigint
language sql
immutable
as $$
  select case lower(coalesce(trim(plan), ''))
    when 'starter' then 600000::bigint
    when 'pro' then 2500000::bigint
    when 'business' then 12000000::bigint
    else 80000::bigint
  end;
$$;

create or replace function public._ai_plan_deepgram_seconds_limit(plan text)
returns bigint
language sql
immutable
as $$
  select case lower(coalesce(trim(plan), ''))
    when 'starter' then (5 * 3600)::bigint
    when 'pro' then (20 * 3600)::bigint
    when 'business' then (80 * 3600)::bigint
    else (20 * 60)::bigint
  end;
$$;

revoke all on function public._ai_plan_openai_limit(text) from public;
revoke all on function public._ai_plan_deepgram_seconds_limit(text) from public;

-- ---------------------------------------------------------------------------
-- Apply OpenAI token usage (monthly pool first, then rollover add-on)
-- ---------------------------------------------------------------------------
create or replace function public.ai_apply_openai_token_usage(
  p_user_id uuid,
  p_period_key text,
  p_delta bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit bigint;
  v_old bigint;
  v_new bigint;
  v_addon bigint;
  v_over_old numeric;
  v_over_new numeric;
  v_charge bigint;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_delta is null or p_delta < 0 then
    raise exception 'invalid_delta';
  end if;
  if p_delta = 0 then
    return;
  end if;

  select billing_plan into v_plan from public.user_settings where user_id = p_user_id;
  v_limit := public._ai_plan_openai_limit(v_plan);

  insert into public.user_ai_addon_balance (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select coalesce(u.openai_tokens, 0) into v_old
  from public.user_ai_usage_periods u
  where u.user_id = p_user_id and u.period_key = p_period_key;
  if not found then
    v_old := 0;
  end if;

  v_new := coalesce(v_old, 0) + p_delta;
  v_over_old := greatest(0::numeric, v_old::numeric - v_limit::numeric);
  v_over_new := greatest(0::numeric, v_new::numeric - v_limit::numeric);
  v_charge := (v_over_new - v_over_old)::bigint;

  select coalesce(openai_tokens, 0) into v_addon from public.user_ai_addon_balance where user_id = p_user_id;

  if v_charge > v_addon then
    raise exception 'insufficient_ai_quota' using errcode = 'P0001';
  end if;

  insert into public.user_ai_usage_periods as u (user_id, period_key, openai_tokens)
  values (p_user_id, p_period_key, p_delta)
  on conflict (user_id, period_key) do update
    set openai_tokens = u.openai_tokens + excluded.openai_tokens,
        updated_at = now();

  if v_charge > 0 then
    update public.user_ai_addon_balance
    set openai_tokens = openai_tokens - v_charge,
        updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.ai_apply_openai_token_usage(uuid, text, bigint) from public;
grant execute on function public.ai_apply_openai_token_usage(uuid, text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Apply Deepgram audio seconds (same consumption model)
-- ---------------------------------------------------------------------------
create or replace function public.ai_apply_deepgram_seconds(
  p_user_id uuid,
  p_period_key text,
  p_delta bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit bigint;
  v_old bigint;
  v_new bigint;
  v_addon bigint;
  v_over_old numeric;
  v_over_new numeric;
  v_charge bigint;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_delta is null or p_delta < 0 then
    raise exception 'invalid_delta';
  end if;
  if p_delta = 0 then
    return;
  end if;

  select billing_plan into v_plan from public.user_settings where user_id = p_user_id;
  v_limit := public._ai_plan_deepgram_seconds_limit(v_plan);

  insert into public.user_ai_addon_balance (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select coalesce(u.deepgram_seconds, 0) into v_old
  from public.user_ai_usage_periods u
  where u.user_id = p_user_id and u.period_key = p_period_key;
  if not found then
    v_old := 0;
  end if;

  v_new := coalesce(v_old, 0) + p_delta;
  v_over_old := greatest(0::numeric, v_old::numeric - v_limit::numeric);
  v_over_new := greatest(0::numeric, v_new::numeric - v_limit::numeric);
  v_charge := (v_over_new - v_over_old)::bigint;

  select coalesce(deepgram_seconds, 0) into v_addon from public.user_ai_addon_balance where user_id = p_user_id;

  if v_charge > v_addon then
    raise exception 'insufficient_voice_quota' using errcode = 'P0001';
  end if;

  insert into public.user_ai_usage_periods as u (user_id, period_key, deepgram_seconds)
  values (p_user_id, p_period_key, p_delta)
  on conflict (user_id, period_key) do update
    set deepgram_seconds = u.deepgram_seconds + excluded.deepgram_seconds,
        updated_at = now();

  if v_charge > 0 then
    update public.user_ai_addon_balance
    set deepgram_seconds = deepgram_seconds - v_charge,
        updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.ai_apply_deepgram_seconds(uuid, text, bigint) from public;
grant execute on function public.ai_apply_deepgram_seconds(uuid, text, bigint) to authenticated;
