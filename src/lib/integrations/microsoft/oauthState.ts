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

export function encodeMicrosoftOAuthState(userId: string, returnTo?: string | null): string {
  const exp = Date.now() + TTL_MS;
  const nonce = nodeRandomBytes(12).toString("hex");
  const rt = returnTo?.trim() ? Buffer.from(returnTo.trim().slice(0, 500), "utf8").toString("base64url") : "";
  const payload = rt ? `${userId}|${exp}|${nonce}|${rt}` : `${userId}|${exp}|${nonce}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const token = `${payload}|${sig}`;
  return Buffer.from(token, "utf8").toString("base64url");
}

export function decodeMicrosoftOAuthState(state: string): { userId: string; returnTo?: string } {
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
  if (parts.length !== 3 && parts.length !== 4) throw new Error("Invalid state");
  const [userId, expStr, nonce, rt] = parts as [string, string, string, string?];
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
  if (rt) {
    try {
      const returnTo = Buffer.from(rt, "base64url").toString("utf8").trim();
      if (returnTo) return { userId, returnTo };
    } catch {
      /* ignore */
    }
  }
  return { userId };
}
