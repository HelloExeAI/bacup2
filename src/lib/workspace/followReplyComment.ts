import type { FollowReplyStatusLabel } from "@/lib/workspace/followReplyParse";

const STATUS_HEADING: Record<FollowReplyStatusLabel, string> = {
  completed: "Completed",
  in_progress: "In progress",
  not_started: "Not started",
  handed_off: "Handed off",
};

export function formatFollowReplyDescriptionAppend(
  statusLabel: FollowReplyStatusLabel,
  replyText: string,
  at = new Date(),
): string {
  const when = at.toISOString().slice(0, 16);
  const human = STATUS_HEADING[statusLabel] ?? statusLabel;
  return `[Follow-up reply ${when}] Status: ${human}\n${replyText.trim()}`.trim();
}
