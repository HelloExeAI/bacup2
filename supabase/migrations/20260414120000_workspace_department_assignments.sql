-- Workspace department assignments (fixed taxonomy) + permission to co-manage Business Setup.

alter table public.team_member_permissions
  add column if not exists can_manage_business_setup boolean not null default false;

create table if not exists public.workspace_department_assignments (
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  department text not null
    check (department in ('operations', 'sales', 'marketing', 'people', 'finance', 'admin', 'it')),
  updated_at timestamptz not null default now(),
  primary key (workspace_owner_id, user_id)
);

create index if not exists workspace_dept_assign_owner_idx
  on public.workspace_department_assignments(workspace_owner_id);

alter table public.workspace_department_assignments enable row level security;

create or replace function public.can_manage_workspace_business_setup(uid uuid, ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid = ws
  or exists (
    select 1
    from public.team_members tm
    join public.team_member_permissions tmp on tmp.team_member_id = tm.id
    where tm.owner_user_id = ws
      and tm.member_user_id = uid
      and tm.status = 'active'
      and tmp.can_manage_business_setup = true
  );
$$;

drop policy if exists "workspace_dept_assign_select" on public.workspace_department_assignments;
create policy "workspace_dept_assign_select"
on public.workspace_department_assignments
for select
using (public.user_in_workspace(auth.uid(), workspace_owner_id));

drop policy if exists "workspace_dept_assign_insert" on public.workspace_department_assignments;
create policy "workspace_dept_assign_insert"
on public.workspace_department_assignments
for insert
with check (public.can_manage_workspace_business_setup(auth.uid(), workspace_owner_id));

drop policy if exists "workspace_dept_assign_update" on public.workspace_department_assignments;
create policy "workspace_dept_assign_update"
on public.workspace_department_assignments
for update
using (public.can_manage_workspace_business_setup(auth.uid(), workspace_owner_id))
with check (public.can_manage_workspace_business_setup(auth.uid(), workspace_owner_id));

drop policy if exists "workspace_dept_assign_delete" on public.workspace_department_assignments;
create policy "workspace_dept_assign_delete"
on public.workspace_department_assignments
for delete
using (public.can_manage_workspace_business_setup(auth.uid(), workspace_owner_id));

comment on table public.workspace_department_assignments is
  'Maps each workspace user (founder + team) to a fixed department under Revenue or Support verticals.';
