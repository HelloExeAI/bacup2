-- Secure assignee "update status" links + richer follow_reply_events (web + read tracking).

-- Tokens for public /a/f/[token] flows (validated in API via service role).
create table if not exists public.assignee_followup_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  assignee_email text not null,
  task_ids uuid[] not null,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint assignee_followup_tokens_token_hash_key unique (token_hash)
);

create index if not exists assignee_followup_tokens_owner_idx
  on public.assignee_followup_tokens (owner_user_id);

alter table public.assignee_followup_tokens enable row level security;

drop policy if exists "Owners manage assignee followup tokens" on public.assignee_followup_tokens;
create policy "Owners manage assignee followup tokens"
  on public.assignee_followup_tokens
  for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

-- Generalize follow_reply_events for web_link rows (no Gmail ids) + unread bell.
alter table public.follow_reply_events
  drop constraint if exists follow_reply_events_user_id_gmail_message_id_key;

create unique index if not exists follow_reply_events_user_gmail_msg_unique
  on public.follow_reply_events (user_id, gmail_message_id)
  where gmail_message_id is not null;

alter table public.follow_reply_events
  alter column gmail_message_id drop not null,
  alter column gmail_thread_id drop not null;

alter table public.follow_reply_events
  add column if not exists read_at timestamptz,
  add column if not exists status_label text,
  add column if not exists source text not null default 'email_reply',
  add column if not exists assignee_followup_token_id uuid references public.assignee_followup_tokens (id) on delete set null;

update public.follow_reply_events
set status_label = case intent
  when 'done' then 'completed'
  when 'in_progress' then 'in_progress'
  when 'reassigned' then 'handed_off'
  else 'not_started'
end
where status_label is null;

alter table public.follow_reply_events
  alter column status_label set not null;

alter table public.follow_reply_events
  drop constraint if exists follow_reply_events_status_label_check;
alter table public.follow_reply_events
  add constraint follow_reply_events_status_label_check
  check (status_label in ('completed', 'in_progress', 'not_started', 'handed_off'));

alter table public.follow_reply_events
  drop constraint if exists follow_reply_events_source_check;
alter table public.follow_reply_events
  add constraint follow_reply_events_source_check
  check (source in ('email_reply', 'web_link'));

comment on column public.follow_reply_events.read_at is
  'When the workspace owner dismissed the item in the notification bell; null means unread.';
comment on column public.follow_reply_events.status_label is
  'Normalized assignee-facing status: completed, in_progress, not_started, handed_off.';
comment on column public.follow_reply_events.source is
  'email_reply (Gmail thread) or web_link (public token page).';
