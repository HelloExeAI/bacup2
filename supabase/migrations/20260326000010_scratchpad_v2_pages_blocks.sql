-- Bacup Scratchpad v2: networked blocks + pages

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  constraint pages_title_per_user_unique unique (user_id, title)
);

create index if not exists pages_user_id_idx on public.pages(user_id);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  page_id uuid references public.pages(id) on delete cascade,
  parent_id uuid references public.blocks(id) on delete cascade,
  date date,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  constraint blocks_page_or_date_ck check (
    (page_id is not null and date is null) or
    (page_id is null and date is not null)
  )
);

create index if not exists blocks_user_id_idx on public.blocks(user_id);
create index if not exists blocks_user_date_idx on public.blocks(user_id, date);
create index if not exists blocks_user_page_idx on public.blocks(user_id, page_id);
create index if not exists blocks_parent_id_idx on public.blocks(parent_id);

-- RLS: users can only access their own pages/blocks.
alter table public.pages enable row level security;
drop policy if exists "Users can view their pages" on public.pages;
create policy "Users can view their pages"
on public.pages
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their pages" on public.pages;
create policy "Users can insert their pages"
on public.pages
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their pages" on public.pages;
create policy "Users can update their pages"
on public.pages
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their pages" on public.pages;
create policy "Users can delete their pages"
on public.pages
for delete
using (auth.uid() = user_id);

alter table public.blocks enable row level security;
drop policy if exists "Users can view their blocks" on public.blocks;
create policy "Users can view their blocks"
on public.blocks
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their blocks" on public.blocks;
create policy "Users can insert their blocks"
on public.blocks
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their blocks" on public.blocks;
create policy "Users can update their blocks"
on public.blocks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their blocks" on public.blocks;
create policy "Users can delete their blocks"
on public.blocks
for delete
using (auth.uid() = user_id);

