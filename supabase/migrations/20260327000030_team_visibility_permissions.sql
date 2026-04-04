-- Team membership + dashboard visibility permissions.

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (owner_user_id, member_user_id)
);

create index if not exists team_members_owner_idx
  on public.team_members(owner_user_id, status);

create index if not exists team_members_member_idx
  on public.team_members(member_user_id, status);

create table if not exists public.team_member_permissions (
  team_member_id uuid primary key references public.team_members(id) on delete cascade,
  can_view_dashboard_for_others boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_team_member_permissions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_team_member_permissions_updated_at on public.team_member_permissions;
create trigger on_team_member_permissions_updated_at
before update on public.team_member_permissions
for each row execute function public.set_team_member_permissions_updated_at();

alter table public.team_members enable row level security;
drop policy if exists "Owners can view their team memberships" on public.team_members;
create policy "Owners can view their team memberships"
on public.team_members
for select
using (auth.uid() = owner_user_id);

drop policy if exists "Members can view memberships they belong to" on public.team_members;
create policy "Members can view memberships they belong to"
on public.team_members
for select
using (auth.uid() = member_user_id);

drop policy if exists "Owners can create their team memberships" on public.team_members;
create policy "Owners can create their team memberships"
on public.team_members
for insert
with check (auth.uid() = owner_user_id);

drop policy if exists "Owners can update their team memberships" on public.team_members;
create policy "Owners can update their team memberships"
on public.team_members
for update
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists "Owners can delete their team memberships" on public.team_members;
create policy "Owners can delete their team memberships"
on public.team_members
for delete
using (auth.uid() = owner_user_id);

alter table public.team_member_permissions enable row level security;
drop policy if exists "Owners can view team permissions" on public.team_member_permissions;
create policy "Owners can view team permissions"
on public.team_member_permissions
for select
using (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_permissions.team_member_id
      and auth.uid() = tm.owner_user_id
  )
);

drop policy if exists "Members can view own permissions" on public.team_member_permissions;
create policy "Members can view own permissions"
on public.team_member_permissions
for select
using (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_permissions.team_member_id
      and auth.uid() = tm.member_user_id
  )
);

drop policy if exists "Owners can insert team permissions" on public.team_member_permissions;
create policy "Owners can insert team permissions"
on public.team_member_permissions
for insert
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_permissions.team_member_id
      and auth.uid() = tm.owner_user_id
  )
);

drop policy if exists "Owners can update team permissions" on public.team_member_permissions;
create policy "Owners can update team permissions"
on public.team_member_permissions
for update
using (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_permissions.team_member_id
      and auth.uid() = tm.owner_user_id
  )
)
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_permissions.team_member_id
      and auth.uid() = tm.owner_user_id
  )
);

drop policy if exists "Owners can delete team permissions" on public.team_member_permissions;
create policy "Owners can delete team permissions"
on public.team_member_permissions
for delete
using (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_permissions.team_member_id
      and auth.uid() = tm.owner_user_id
  )
);

