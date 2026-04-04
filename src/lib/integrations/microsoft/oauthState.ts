import { createHmac, randomBytes as nodeRandomBytes, timingSafeEqual } from "crypto";

import { microsoftStateSecret } from "@/lib/integrations/microsoft/microsoftEnv";

function stateSecret(): string {
  const s = microsoftStateSecret();
  if (!s) {
    throw new Error(
      "Set MICROSOFT_OAUTH_STATE_SECRET or MICROSOFT_CLIENT_SECRET (or GOOGLE_OAUTH_STATE_SECRET) for OAuth state signing",
    );
  }
  return s;
}

const TTL_MS = 10 * 60 * 1000;

export function encodeMicrosoftOAuthState(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const nonce = nodeRandomBytes(12).toString("hex");
  const payload = `${userId}|${exp}|${nonce}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const token = `${payload}|${sig}`;
  return Buffer.from(token, "utf8").toString("base64url");
}

export function decodeMicrosoftOAuthState(state: string): { userId: string } {
  let raw: string;
  try {
    raw = Buffer.from(state, "base64url").toString("utf8");
  } catch {
    throw new Error("Invalid state");
  }
  const last = raw.lastIndexOf("|");
  if (last < 0) throw new Error("Invalid state");
  const payload = raw.slice(0, last);
  const sig = raw.slice(last + 1);
  const parts = payload.split("|");
  if (parts.length !== 3) throw new Error("Invalid state");
  const [userId, expStr, nonce] = parts;
  const exp = Number(expStr);
  if (!userId || !nonce || !Number.isFinite(exp) || Date.now() > exp) {
    throw new Error("State expired");
  }
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid state signature");
  }
  return { userId };
}
