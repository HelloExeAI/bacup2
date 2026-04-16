import { createHash, randomBytes } from "crypto";

export const ASSIGNEE_FOLLOWUP_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function mintAssigneeFollowupToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  return { token, tokenHash };
}

export function hashAssigneeFollowupToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}
