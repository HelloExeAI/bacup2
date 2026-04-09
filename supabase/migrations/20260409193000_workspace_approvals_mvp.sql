-- Approvals MVP: structured approval requests routed to immediate manager.

create table if not exists public.workspace_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  approver_user_id uuid not null references auth.users(id) on delete cascade,

  template_type text not null,
  title text not null,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'needs_changes', 'cancelled')),

  -- Common structured fields + template-specific fields.
  summary_json jsonb not null default '{}'::jsonb,
  template_json jsonb not null default '{}'::jsonb,

  currency text,
  cost_total_cents bigint,
  needed_by timestamptz,
  decision_deadline timestamptz,

  routing_reason text,

  decision_note text,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_approvals_inbox_idx
  on public.workspace_approvals(workspace_owner_id, approver_user_id, status, updated_at desc);

create index if not exists workspace_approvals_requester_idx
  on public.workspace_approvals(workspace_owner_id, requester_user_id, status, updated_at desc);

create table if not exists public.workspace_approval_events (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  approval_id uuid not null references public.workspace_approvals(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  note text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workspace_approval_events_idx
  on public.workspace_approval_events(workspace_owner_id, approval_id, created_at desc);

alter table public.workspace_approvals enable row level security;
alter table public.workspace_approval_events enable row level security;

-- RLS: approvals
drop policy if exists "approvals_select" on public.workspace_approvals;
create policy "approvals_select"
on public.workspace_approvals for select
using (
  public.user_in_workspace(auth.uid(), workspace_owner_id)
  and (
    auth.uid() = workspace_owner_id
    or auth.uid() = requester_user_id
    or auth.uid() = approver_user_id
  )
);

drop policy if exists "approvals_insert" on public.workspace_approvals;
create policy "approvals_insert"
on public.workspace_approvals for insert
with check (
  public.user_in_workspace(auth.uid(), workspace_owner_id)
  and auth.uid() = requester_user_id
);

-- Requester can edit while pending / needs_changes (including cancel).
drop policy if exists "approvals_update_requester" on public.workspace_approvals;
create policy "approvals_update_requester"
on public.workspace_approvals for update
using (
  public.user_in_workspace(auth.uid(), workspace_owner_id)
  and auth.uid() = requester_user_id
  and status in ('pending', 'needs_changes')
)
with check (
  public.user_in_workspace(auth.uid(), workspace_owner_id)
  and auth.uid() = requester_user_id
);

-- Approver can decide.
drop policy if exists "approvals_update_approver" on public.workspace_approvals;
create policy "approvals_update_approver"
on public.workspace_approvals for update
using (
  public.user_in_workspace(auth.uid(), workspace_owner_id)
  and auth.uid() = approver_user_id
  and status in ('pending', 'needs_changes')
)
with check (
  public.user_in_workspace(auth.uid(), workspace_owner_id)
  and auth.uid() = approver_user_id
);

-- RLS: events
drop policy if exists "approval_events_select" on public.workspace_approval_events;
create policy "approval_events_select"
on public.workspace_approval_events for select
using (
  public.user_in_workspace(auth.uid(), workspace_owner_id)
  and (
    auth.uid() = workspace_owner_id
    or exists (
      select 1 from public.workspace_approvals a
      where a.id = approval_id
        and a.workspace_owner_id = workspace_owner_id
        and (a.requester_user_id = auth.uid() or a.approver_user_id = auth.uid())
    )
  )
);

drop policy if exists "approval_events_insert" on public.workspace_approval_events;
create policy "approval_events_insert"
on public.workspace_approval_events for insert
with check (
  public.user_in_workspace(auth.uid(), workspace_owner_id)
  and auth.uid() = actor_user_id
  and exists (
    select 1 from public.workspace_approvals a
    where a.id = approval_id
      and a.workspace_owner_id = workspace_owner_id
      and (a.requester_user_id = auth.uid() or a.approver_user_id = auth.uid() or a.workspace_owner_id = auth.uid())
  )
);

comment on table public.workspace_approvals is 'Structured approval requests routed to managers (MVP).';
comment on table public.workspace_approval_events is 'Immutable timeline events for approvals (MVP).';

