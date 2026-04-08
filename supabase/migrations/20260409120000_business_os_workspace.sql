-- Business OS V1: org reporting, EA delegation, decisions, projects, values & recognition.
-- workspace_owner_id = founder's user id for that workspace.

create table if not exists public.org_reporting_edges (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  report_user_id uuid not null references auth.users(id) on delete cascade,
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  relation_rank smallint not null default 1 check (relation_rank >= 1 and relation_rank <= 3),
  created_at timestamptz not null default now(),
  unique (workspace_owner_id, report_user_id, manager_user_id)
);

create index if not exists org_reporting_workspace_idx
  on public.org_reporting_edges(workspace_owner_id);

create table if not exists public.ea_access_policies (
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  ea_user_id uuid not null references auth.users(id) on delete cascade,
  can_view_email_derived_tasks boolean not null default false,
  can_view_calendar_summary boolean not null default false,
  can_view_decisions boolean not null default true,
  can_view_projects boolean not null default true,
  can_view_recognition_feed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (workspace_owner_id, ea_user_id)
);

create table if not exists public.workspace_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  context_notes text,
  status text not null default 'pending' check (status in ('pending', 'decided', 'deferred')),
  priority smallint not null default 2 check (priority >= 1 and priority <= 3),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_decisions_owner_idx
  on public.workspace_decisions(workspace_owner_id, status, priority);

create table if not exists public.workspace_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  health_status text not null default 'unknown' check (health_status in ('green', 'yellow', 'red', 'unknown')),
  summary text,
  owner_user_id uuid references auth.users(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_projects_owner_idx
  on public.workspace_projects(workspace_owner_id);

create table if not exists public.company_values (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_recognitions (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  value_id uuid references public.company_values(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_recognitions_owner_idx
  on public.workspace_recognitions(workspace_owner_id, created_at desc);

-- RLS
alter table public.org_reporting_edges enable row level security;
alter table public.ea_access_policies enable row level security;
alter table public.workspace_decisions enable row level security;
alter table public.workspace_projects enable row level security;
alter table public.company_values enable row level security;
alter table public.workspace_recognitions enable row level security;

-- Helper: user belongs to workspace (as founder or team member)
create or replace function public.user_in_workspace(uid uuid, ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid = ws
  or exists (
    select 1 from public.team_members tm
    where tm.owner_user_id = ws and tm.member_user_id = uid and tm.status = 'active'
  );
$$;

-- org_reporting_edges
drop policy if exists "org_reporting_select" on public.org_reporting_edges;
create policy "org_reporting_select"
on public.org_reporting_edges for select
using (public.user_in_workspace(auth.uid(), workspace_owner_id));

drop policy if exists "org_reporting_write_owner" on public.org_reporting_edges;
create policy "org_reporting_write_owner"
on public.org_reporting_edges for all
using (auth.uid() = workspace_owner_id)
with check (auth.uid() = workspace_owner_id);

-- ea_access_policies
drop policy if exists "ea_policy_select" on public.ea_access_policies;
create policy "ea_policy_select"
on public.ea_access_policies for select
using (
  auth.uid() = workspace_owner_id
  or auth.uid() = ea_user_id
);

drop policy if exists "ea_policy_write_owner" on public.ea_access_policies;
create policy "ea_policy_write_owner"
on public.ea_access_policies for all
using (auth.uid() = workspace_owner_id)
with check (auth.uid() = workspace_owner_id);

-- workspace_decisions
drop policy if exists "decisions_select" on public.workspace_decisions;
create policy "decisions_select"
on public.workspace_decisions for select
using (public.user_in_workspace(auth.uid(), workspace_owner_id));

drop policy if exists "decisions_write_owner" on public.workspace_decisions;
create policy "decisions_write_owner"
on public.workspace_decisions for insert
with check (auth.uid() = workspace_owner_id);

drop policy if exists "decisions_update_owner" on public.workspace_decisions;
create policy "decisions_update_owner"
on public.workspace_decisions for update
using (auth.uid() = workspace_owner_id)
with check (auth.uid() = workspace_owner_id);

drop policy if exists "decisions_delete_owner" on public.workspace_decisions;
create policy "decisions_delete_owner"
on public.workspace_decisions for delete
using (auth.uid() = workspace_owner_id);

-- workspace_projects
drop policy if exists "projects_select" on public.workspace_projects;
create policy "projects_select"
on public.workspace_projects for select
using (public.user_in_workspace(auth.uid(), workspace_owner_id));

drop policy if exists "projects_write_owner" on public.workspace_projects;
create policy "projects_write_owner"
on public.workspace_projects for insert
with check (auth.uid() = workspace_owner_id);

drop policy if exists "projects_update_owner" on public.workspace_projects;
create policy "projects_update_owner"
on public.workspace_projects for update
using (auth.uid() = workspace_owner_id)
with check (auth.uid() = workspace_owner_id);

drop policy if exists "projects_delete_owner" on public.workspace_projects;
create policy "projects_delete_owner"
on public.workspace_projects for delete
using (auth.uid() = workspace_owner_id);

-- company_values
drop policy if exists "values_select" on public.company_values;
create policy "values_select"
on public.company_values for select
using (public.user_in_workspace(auth.uid(), workspace_owner_id));

drop policy if exists "values_write_owner" on public.company_values;
create policy "values_write_owner"
on public.company_values for all
using (auth.uid() = workspace_owner_id)
with check (auth.uid() = workspace_owner_id);

-- workspace_recognitions
drop policy if exists "recognitions_select" on public.workspace_recognitions;
create policy "recognitions_select"
on public.workspace_recognitions for select
using (public.user_in_workspace(auth.uid(), workspace_owner_id));

drop policy if exists "recognitions_insert_members" on public.workspace_recognitions;
create policy "recognitions_insert_members"
on public.workspace_recognitions for insert
with check (
  public.user_in_workspace(auth.uid(), workspace_owner_id)
  and auth.uid() = from_user_id
);

-- Only founder deletes moderation-style (optional); allow creator delete own within 24h — keep simple: owner can delete
drop policy if exists "recognitions_delete_owner" on public.workspace_recognitions;
create policy "recognitions_delete_owner"
on public.workspace_recognitions for delete
using (auth.uid() = workspace_owner_id or auth.uid() = from_user_id);

comment on table public.org_reporting_edges is 'Optional multi-manager reporting lines for workspace members.';
comment on table public.ea_access_policies is 'Founder-defined visibility for EA on workspace surfaces.';
comment on table public.workspace_decisions is 'Decision queue items for leadership (founder-owned workspace).';
comment on table public.workspace_projects is 'High-level project health cards for the workspace.';
comment on table public.company_values is 'Values tags for recognition.';
comment on table public.workspace_recognitions is 'Peer recognition feed (no monetary rewards in V1).';
