-- One-time cleanup:
-- Any task assigned to someone other than "self" should be a follow-up.

update public.tasks
set type = 'followup'
where type = 'todo'
  and assigned_to is not null
  and btrim(assigned_to) <> ''
  and lower(btrim(assigned_to)) <> 'self';

