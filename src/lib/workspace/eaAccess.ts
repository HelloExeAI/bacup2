export type EaAccessPolicyRow = {
  workspace_owner_id: string;
  ea_user_id: string;
  can_view_email_derived_tasks: boolean;
  can_view_calendar_summary: boolean;
  can_view_decisions: boolean;
  can_view_projects: boolean;
  can_view_recognition_feed: boolean;
};

export function defaultEaPolicy(workspaceOwnerId: string, eaUserId: string): EaAccessPolicyRow {
  return {
    workspace_owner_id: workspaceOwnerId,
    ea_user_id: eaUserId,
    can_view_email_derived_tasks: false,
    can_view_calendar_summary: false,
    can_view_decisions: true,
    can_view_projects: true,
    can_view_recognition_feed: true,
  };
}
