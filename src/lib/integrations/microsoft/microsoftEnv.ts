function cleanCredential(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
  return t.length ? t : undefined;
}

export function microsoftClientId(): string | undefined {
  return cleanCredential(process.env.MICROSOFT_CLIENT_ID) || cleanCredential(process.env.MICROSOFT_OAUTH_CLIENT_ID);
}

export function microsoftClientSecret(): string | undefined {
  return cleanCredential(process.env.MICROSOFT_CLIENT_SECRET) || cleanCredential(process.env.MICROSOFT_OAUTH_CLIENT_SECRET);
}

export function microsoftStateSecret(): string | undefined {
  return (
    process.env.MICROSOFT_OAUTH_STATE_SECRET?.trim() ||
    microsoftClientSecret() ||
    process.env.GOOGLE_OAUTH_STATE_SECRET?.trim() ||
    undefined
  );
}

export function microsoftRedirectUriFromRequest(req: Request): string {
  const env = process.env.MICROSOFT_OAUTH_REDIRECT_URI?.trim();
  if (env) return env;
  const u = new URL(req.url);
  const origin = u.origin;
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  // Prefer the actual request host so OAuth matches the browser session (localhost, preview URLs,
  // or apex vs www). Only use NEXT_PUBLIC_APP_URL when it matches this request's host.
  if (base?.startsWith("http")) {
    try {
      if (new URL(base).host === u.host) {
        return `${base}/api/integrations/microsoft/callback`;
      }
    } catch {
      /* fall through */
    }
  }
  return `${origin}/api/integrations/microsoft/callback`;
}
