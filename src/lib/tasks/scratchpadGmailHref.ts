import type { Task } from "@/store/taskStore";

/** Scratchpad URL to open the source email for reply / reply later follow-up. */
export function scratchpadGmailHref(t: Pick<Task, "gmail_message_id" | "connected_account_id">): string | null {
  const mid = t.gmail_message_id?.trim();
  const aid = t.connected_account_id?.trim();
  if (!mid || !aid) return null;
  const u = new URLSearchParams();
  u.set("gmailMessageId", mid);
  u.set("gmailAccountId", aid);
  return `/scratchpad?${u.toString()}`;
}
