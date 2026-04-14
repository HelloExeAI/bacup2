-- Add Management vertical: founder, cofounder, ceo (workspace role mapping in Business Setup).

alter table public.workspace_department_assignments
  drop constraint if exists workspace_department_assignments_department_check;

alter table public.workspace_department_assignments
  add constraint workspace_department_assignments_department_check
  check (
    department in (
      'operations', 'sales', 'marketing',
      'people', 'finance', 'admin', 'it',
      'founder', 'cofounder', 'ceo'
    )
  );
