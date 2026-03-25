-- Notes table upgrade: type + parent_id for threading / multimodal notes.

alter table public.notes
  add column if not exists type text default 'text',
  add column if not exists parent_id uuid;

