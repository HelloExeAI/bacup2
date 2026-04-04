-- Bacup product tiers (Solo / Operator / Executive) + optional Ask Bacup add-on.
-- Maps to billing_plan for AI/voice RPC limits (see _ai_plan_* below).

alter table public.user_settings
  add column if not exists subscription_tier text not null default 'solo_os'
    check (subscription_tier in ('solo_os', 'operator_os', 'executive_os')),
  add column if not exists billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'yearly')),
  add column if not exists subscription_status text not null default 'active'
    check (subscription_status in ('active', 'trial', 'expired', 'canceled')),
  add column if not exists current_period_end timestamptz,
  add column if not exists ask_bacup_addon boolean not null default false;

comment on column public.user_settings.subscription_tier is 'Product tier: solo_os | operator_os | executive_os';
comment on column public.user_settings.billing_interval is 'Displayed billing cadence until Stripe (monthly | yearly)';
comment on column public.user_settings.subscription_status is 'Lifecycle state (Stripe will drive this later)';
comment on column public.user_settings.current_period_end is 'Next renewal boundary (placeholder until Stripe)';
comment on column public.user_settings.ask_bacup_addon is 'Standalone Ask Bacup on lower tiers';

alter table public.user_settings alter column billing_plan set default 'solo';

-- Align existing rows with new tier column + solo billing id (zero included AI).
update public.user_settings
set
  subscription_tier = case lower(trim(billing_plan))
    when 'starter' then 'operator_os'
    when 'pro' then 'executive_os'
    when 'business' then 'executive_os'
    else 'solo_os'
  end,
  billing_plan = case
    when lower(trim(billing_plan)) = 'free' then 'solo'
    else billing_plan
  end;

-- "solo" = System layer: no included OpenAI pool (voice quota same as former free tier).
create or replace function public._ai_plan_openai_limit(plan text)
returns bigint
language sql
immutable
as $$
  select case lower(coalesce(trim(plan), ''))
    when 'solo' then 0::bigint
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
    when 'solo' then (20 * 60)::bigint
    when 'starter' then (5 * 3600)::bigint
    when 'pro' then (20 * 3600)::bigint
    when 'business' then (80 * 3600)::bigint
    else (20 * 60)::bigint
  end;
$$;
