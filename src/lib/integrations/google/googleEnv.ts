/** Strip whitespace and invisible chars often pasted from docs / PDFs. */
function cleanCredential(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
  return t.length ? t : undefined;
}

/**
 * Web client ID + secret from Google Cloud Console.
 * Checks GOOGLE_CLIENT_ID first (typical .env name), then GOOGLE_OAUTH_CLIENT_ID.
 */
export function googleClientId(): string | undefined {
  return (
    cleanCredential(process.env.GOOGLE_CLIENT_ID) ||
    cleanCredential(process.env.GOOGLE_OAUTH_CLIENT_ID) ||
    undefined
  );
}

export function googleClientSecret(): string | undefined {
  return (
    cleanCredential(process.env.GOOGLE_CLIENT_SECRET) ||
    cleanCredential(process.env.GOOGLE_OAUTH_CLIENT_SECRET) ||
    undefined
  );
}

export function googleStateSecret(): string | undefined {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET?.trim() ||
    googleClientSecret() ||
    undefined
  );
}

export function googleRedirectUriFromRequest(req: Request): string {
  const env = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (env) return env;
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (base?.startsWith("http")) {
    return `${base}/api/integrations/google/callback`;
  }
  const u = new URL(req.url);
  return `${u.origin}/api/integrations/google/callback`;
}
