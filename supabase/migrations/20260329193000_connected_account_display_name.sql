-- Optional label for connected mail/calendar accounts (shown in Scratchpad Mail, etc.).

alter table public.user_connected_accounts
  add column if not exists display_name text;

comment on column public.user_connected_accounts.display_name is 'User-defined label; falls back to account_email when null.';
