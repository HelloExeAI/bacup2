-- RLS: users can only access their own rows (notes/tasks/events/conversations).

-- Notes
alter table public.notes enable row level security;
drop policy if exists "Users can view their notes" on public.notes;
create policy "Users can view their notes"
on public.notes
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their notes" on public.notes;
create policy "Users can insert their notes"
on public.notes
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their notes" on public.notes;
create policy "Users can update their notes"
on public.notes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their notes" on public.notes;
create policy "Users can delete their notes"
on public.notes
for delete
using (auth.uid() = user_id);

-- Tasks
alter table public.tasks enable row level security;
drop policy if exists "Users can view their tasks" on public.tasks;
create policy "Users can view their tasks"
on public.tasks
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their tasks" on public.tasks;
create policy "Users can insert their tasks"
on public.tasks
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their tasks" on public.tasks;
create policy "Users can update their tasks"
on public.tasks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their tasks" on public.tasks;
create policy "Users can delete their tasks"
on public.tasks
for delete
using (auth.uid() = user_id);

-- Events
alter table public.events enable row level security;
drop policy if exists "Users can view their events" on public.events;
create policy "Users can view their events"
on public.events
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their events" on public.events;
create policy "Users can insert their events"
on public.events
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their events" on public.events;
create policy "Users can update their events"
on public.events
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their events" on public.events;
create policy "Users can delete their events"
on public.events
for delete
using (auth.uid() = user_id);

-- Conversations
alter table public.conversations enable row level security;
drop policy if exists "Users can view their conversations" on public.conversations;
create policy "Users can view their conversations"
on public.conversations
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their conversations" on public.conversations;
create policy "Users can insert their conversations"
on public.conversations
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their conversations" on public.conversations;
create policy "Users can update their conversations"
on public.conversations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their conversations" on public.conversations;
create policy "Users can delete their conversations"
on public.conversations
for delete
using (auth.uid() = user_id);

