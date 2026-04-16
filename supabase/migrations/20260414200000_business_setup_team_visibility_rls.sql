-- Allow workspace members to read the full team roster and Team Setup admins to read
-- permission rows, so /api/workspace/team-setup can use the session client (RLS as the
-- signed-in user) instead of a misconfigured service-role client (anon key → auth.uid() null).

drop policy if exists "Workspace members can view team roster" on public.team_members;
create policy "Workspace members can view team roster"
on public.team_members
for select
using (public.user_in_workspace(auth.uid(), owner_user_id));

-- Delegated Team Setup editors need to see all collaborators' permission flags (founders already covered).
drop policy if exists "Business setup admins can view team permissions" on public.team_member_permissions;
create policy "Business setup admins can view team permissions"
on public.team_member_permissions
for select
using (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_permissions.team_member_id
      and public.can_manage_workspace_business_setup(auth.uid(), tm.owner_user_id)
  )
);
