-- IMAP / CalDAV (other email providers) — credentials live in imap_config (encrypted at app layer).

alter table public.user_connected_accounts
  drop constraint if exists user_connected_accounts_provider_check;

alter table public.user_connected_accounts
  add constraint user_connected_accounts_provider_check
  check (provider in ('google', 'microsoft', 'imap'));

alter table public.user_connected_accounts
  add column if not exists imap_config jsonb;

comment on column public.user_connected_accounts.imap_config is
  'When provider=imap: encrypted credentials + server metadata (never store plaintext passwords in logs).';
