import { microsoftClientId, microsoftClientSecret } from "@/lib/integrations/microsoft/microsoftEnv";
import { MICROSOFT_GRAPH_ME, MICROSOFT_TOKEN_URL } from "@/lib/integrations/microsoft/oauthConstants";

export type MicrosoftTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

export async function exchangeMicrosoftAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<MicrosoftTokenResponse> {
  const clientId = microsoftClientId();
  const clientSecret = microsoftClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.");
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const err = typeof j?.error === "string" ? j.error : "token_error";
    const desc = typeof j?.error_description === "string" ? j.error_description : "";
    throw new Error(`Microsoft token exchange failed: ${err}${desc ? ` — ${desc}` : ""}`);
  }

  const access_token = typeof j?.access_token === "string" ? j.access_token : "";
  const expires_in = typeof j?.expires_in === "number" ? j.expires_in : 3600;
  if (!access_token) throw new Error("Microsoft token response missing access_token");

  return {
    access_token,
    expires_in,
    refresh_token: typeof j?.refresh_token === "string" ? j.refresh_token : undefined,
    scope: typeof j?.scope === "string" ? j.scope : undefined,
    token_type: typeof j?.token_type === "string" ? j.token_type : "Bearer",
  };
}

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<MicrosoftTokenResponse> {
  const clientId = microsoftClientId();
  const clientSecret = microsoftClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth not configured");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const err = typeof j?.error === "string" ? j.error : "token_error";
    const desc = typeof j?.error_description === "string" ? j.error_description : "";
    throw new Error(`Microsoft refresh failed: ${err}${desc ? ` — ${desc}` : ""}`);
  }

  const access_token = typeof j?.access_token === "string" ? j.access_token : "";
  const expires_in = typeof j?.expires_in === "number" ? j.expires_in : 3600;
  if (!access_token) throw new Error("Microsoft refresh missing access_token");

  return {
    access_token,
    expires_in,
    refresh_token: typeof j?.refresh_token === "string" ? j.refresh_token : undefined,
    scope: typeof j?.scope === "string" ? j.scope : undefined,
    token_type: typeof j?.token_type === "string" ? j.token_type : "Bearer",
  };
}

export type MicrosoftGraphMe = {
  id: string;
  email: string;
  givenName?: string;
  surname?: string;
  displayName?: string;
};

export async function fetchMicrosoftUserProfile(accessToken: string): Promise<MicrosoftGraphMe> {
  const res = await fetch(MICROSOFT_GRAPH_ME, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new Error("Failed to load Microsoft profile");
  }
  const id = typeof j?.id === "string" ? j.id : "";
  const mail = typeof j?.mail === "string" && j.mail ? j.mail : "";
  const upn = typeof j?.userPrincipalName === "string" ? j.userPrincipalName : "";
  const email = mail || upn;
  if (!id || !email) {
    throw new Error("Microsoft profile missing id or email");
  }
  const givenName = typeof j?.givenName === "string" ? j.givenName : undefined;
  const surname = typeof j?.surname === "string" ? j.surname : undefined;
  const displayName = typeof j?.displayName === "string" ? j.displayName : undefined;
  return { id, email, givenName, surname, displayName };
}
