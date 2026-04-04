/**
 * Fire-and-forget: extract tasks from a Gmail message after send (reply / forward / reply_all only).
 */
export function queueGmailProcessAfterSend(
  accountId: string,
  messageId: string | undefined,
  trigger: "reply" | "forward" | "reply_all",
) {
  if (!messageId?.trim()) return;
  void fetch("/api/integrations/google/gmail/process-messages", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accountId,
      messageIds: [messageId.trim()],
      trigger,
    }),
  }).catch(() => {
    /* ignore */
  });
}
