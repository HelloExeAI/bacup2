-- User-initiated Gmail follow-ups (reply later / draft saved) — one pending row per kind per message.

alter table public.tasks
  add column if not exists gmail_followup_kind text;

alter table public.tasks
  drop constraint if exists tasks_gmail_followup_kind_check;

alter table public.tasks
  add constraint tasks_gmail_followup_kind_check
  check (gmail_followup_kind is null or gmail_followup_kind in ('reply_later', 'draft_saved'));

create unique index if not exists tasks_gmail_followup_pending_one_per_kind_idx
  on public.tasks (user_id, gmail_message_id, gmail_followup_kind)
  where status = 'pending' and gmail_message_id is not null and gmail_followup_kind is not null;
