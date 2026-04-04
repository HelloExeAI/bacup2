-- Scratchpad v2 performance + offline sync fields

-- Add sync-friendly timestamps + tombstones.
alter table public.pages
  add column if not exists updated_at timestamptz not null default now();

alter table public.blocks
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz null,
  add column if not exists client_updated_at timestamptz null;

-- Generic updated_at trigger helper.
create or replace function public.bacup_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pages_set_updated_at on public.pages;
create trigger trg_pages_set_updated_at
before update on public.pages
for each row
execute function public.bacup_set_updated_at();

drop trigger if exists trg_blocks_set_updated_at on public.blocks;
create trigger trg_blocks_set_updated_at
before update on public.blocks
for each row
execute function public.bacup_set_updated_at();

-- Fast daily-tree retrieval: user + date + parent + ordering (ignore deleted).
create index if not exists blocks_user_date_parent_order_idx
  on public.blocks(user_id, date, parent_id, order_index)
  where deleted_at is null;

-- Fast page-tree retrieval: user + page + parent + ordering (ignore deleted).
create index if not exists blocks_user_page_parent_order_idx
  on public.blocks(user_id, page_id, parent_id, order_index)
  where deleted_at is null;

-- Optional: accelerate sync pulls by updated_at.
create index if not exists blocks_user_updated_at_idx
  on public.blocks(user_id, updated_at);

