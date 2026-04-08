-- Business OS V2: playbooks / recurring programs, cross-team dependency map, meeting OS.

-- Playbook templates (recurring program blueprints: launch, month-close, hiring sprint, etc.)
create table if not exists public.workspace_playbook_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  cadence_label text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists workspace_playbook_templates_owner_idx
  on public.workspace_playbook_templates(workspace_owner_id);

create table if not exists public.workspace_playbook_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workspace_playbook_templates(id) on delete cascade,
  sort_order int not null default 0,
  title text not null,
  detail text
);

create index if not exists workspace_playbook_steps_template_idx
  on public.workspace_playbook_template_steps(template_id);

create table if not exists public.workspace_playbook_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.workspace_playbook_templates(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed')),
  started_by uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists workspace_playbook_runs_owner_idx
  on public.workspace_playbook_runs(workspace_owner_id);
create index if not exists workspace_playbook_runs_template_idx
  on public.workspace_playbook_runs(template_id);

create table if not exists public.workspace_playbook_run_progress (
  run_id uuid not null references public.workspace_playbook_runs(id) on delete cascade,
  step_id uuid not null references public.workspace_playbook_template_steps(id) on delete cascade,
  is_done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (run_id, step_id)
);

-- Cross-team dependency map (first-class “A waiting on B” objects)
create table if not exists public.workspace_cross_team_dependencies (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  waiting_on_label text not null,
  blocked_party_label text not null,
  project_id uuid references public.workspace_projects(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_cross_team_deps_owner_idx
  on public.workspace_cross_team_dependencies(workspace_owner_id, status);

-- Meeting OS: before (agenda) / after (outcomes + action items); optional calendar tie-out
create table if not exists public.workspace_meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  scheduled_at timestamptz,
  calendar_event_id text,
  phase text not null default 'planned' check (phase in ('planned', 'completed')),
  before_agenda text,
  before_decisions_needed text,
  after_decisions_summary text,
  after_action_items jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists workspace_meetings_owner_idx
  on public.workspace_meetings(workspace_owner_id, scheduled_at desc nulls last);

-- RLS
alter table public.workspace_playbook_templates enable row level security;
alter table public.workspace_playbook_template_steps enable row level security;
alter table public.workspace_playbook_runs enable row level security;
alter table public.workspace_playbook_run_progress enable row level security;
alter table public.workspace_cross_team_dependencies enable row level security;
alter table public.workspace_meetings enable row level security;

-- Templates: workspace read; founder write
drop policy if exists "playbook_templates_select" on public.workspace_playbook_templates;
create policy "playbook_templates_select"
on public.workspace_playbook_templates for select
using (public.user_in_workspace(auth.uid(), workspace_owner_id));

drop policy if exists "playbook_templates_write_owner" on public.workspace_playbook_templates;
create policy "playbook_templates_write_owner"
on public.workspace_playbook_templates for all
using (auth.uid() = workspace_owner_id)
with check (auth.uid() = workspace_owner_id);

drop policy if exists "playbook_steps_select" on public.workspace_playbook_template_steps;
create policy "playbook_steps_select"
on public.workspace_playbook_template_steps for select
using (
  exists (
    select 1 from public.workspace_playbook_templates t
    where t.id = template_id and public.user_in_workspace(auth.uid(), t.workspace_owner_id)
  )
);

drop policy if exists "playbook_steps_write_owner" on public.workspace_playbook_template_steps;
create policy "playbook_steps_write_owner"
on public.workspace_playbook_template_steps for all
using (
  exists (
    select 1 from public.workspace_playbook_templates t
    where t.id = template_id and auth.uid() = t.workspace_owner_id
  )
)
with check (
  exists (
    select 1 from public.workspace_playbook_templates t
    where t.id = template_id and auth.uid() = t.workspace_owner_id
  )
);

-- Runs + progress: workspace read; founder write
drop policy if exists "playbook_runs_select" on public.workspace_playbook_runs;
create policy "playbook_runs_select"
on public.workspace_playbook_runs for select
using (public.user_in_workspace(auth.uid(), workspace_owner_id));

drop policy if exists "playbook_runs_write_owner" on public.workspace_playbook_runs;
create policy "playbook_runs_write_owner"
on public.workspace_playbook_runs for all
using (auth.uid() = workspace_owner_id)
with check (auth.uid() = workspace_owner_id);

drop policy if exists "playbook_progress_select" on public.workspace_playbook_run_progress;
create policy "playbook_progress_select"
on public.workspace_playbook_run_progress for select
using (
  exists (
    select 1 from public.workspace_playbook_runs r
    where r.id = run_id and public.user_in_workspace(auth.uid(), r.workspace_owner_id)
  )
);

drop policy if exists "playbook_progress_write_owner" on public.workspace_playbook_run_progress;
create policy "playbook_progress_write_owner"
on public.workspace_playbook_run_progress for all
using (
  exists (
    select 1 from public.workspace_playbook_runs r
    where r.id = run_id and auth.uid() = r.workspace_owner_id
  )
)
with check (
  exists (
    select 1 from public.workspace_playbook_runs r
    where r.id = run_id and auth.uid() = r.workspace_owner_id
  )
);

-- Dependencies
drop policy if exists "cross_team_deps_select" on public.workspace_cross_team_dependencies;
create policy "cross_team_deps_select"
on public.workspace_cross_team_dependencies for select
using (public.user_in_workspace(auth.uid(), workspace_owner_id));

drop policy if exists "cross_team_deps_write_owner" on public.workspace_cross_team_dependencies;
create policy "cross_team_deps_write_owner"
on public.workspace_cross_team_dependencies for all
using (auth.uid() = workspace_owner_id)
with check (auth.uid() = workspace_owner_id);

-- Meetings
drop policy if exists "workspace_meetings_select" on public.workspace_meetings;
create policy "workspace_meetings_select"
on public.workspace_meetings for select
using (public.user_in_workspace(auth.uid(), workspace_owner_id));

drop policy if exists "workspace_meetings_write_owner" on public.workspace_meetings;
create policy "workspace_meetings_write_owner"
on public.workspace_meetings for all
using (auth.uid() = workspace_owner_id)
with check (auth.uid() = workspace_owner_id);

comment on table public.workspace_playbook_templates is 'V2 recurring program / playbook definitions.';
comment on table public.workspace_playbook_template_steps is 'Checklist steps for a playbook template.';
comment on table public.workspace_playbook_runs is 'One execution of a playbook template.';
comment on table public.workspace_playbook_run_progress is 'Per-step completion for a run.';
comment on table public.workspace_cross_team_dependencies is 'V2 cross-team dependency map.';
comment on table public.workspace_meetings is 'V2 meeting OS: agenda before, outcomes after.';
