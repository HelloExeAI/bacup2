export type AutomatedFollowupHistoryItem = {
  task_id: string;
  title: string;
  assigned_to: string;
  task_status: string;
  sent_at: string;
  latest_web_status_label: string | null;
  latest_web_event_at: string | null;
  latest_web_preview: string | null;
};
