import { googleClientId, googleClientSecret } from "@/lib/integrations/google/googleEnv";
import { GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL } from "@/lib/integrations/google/oauthConstants";

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

export type GoogleUserInfo = {
  id: string;
  email: string;
  verified_email?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
};

export async function exchangeGoogleAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET (or GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).",
    );
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const err = typeof j?.error === "string" ? j.error : "token_error";
    const desc = typeof j?.error_description === "string" ? j.error_description : "";
    throw new Error(`Google token exchange failed: ${err}${desc ? ` — ${desc}` : ""}`);
  }

  const access_token = typeof j?.access_token === "string" ? j.access_token : "";
  const expires_in = typeof j?.expires_in === "number" ? j.expires_in : 3600;
  if (!access_token) throw new Error("Google token response missing access_token");

  return {
    access_token,
    expires_in,
    refresh_token: typeof j?.refresh_token === "string" ? j.refresh_token : undefined,
    scope: typeof j?.scope === "string" ? j.scope : undefined,
    token_type: typeof j?.token_type === "string" ? j.token_type : "Bearer",
  };
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new Error("Failed to load Google profile");
  }
  const id = typeof j?.id === "string" ? j.id : "";
  const email = typeof j?.email === "string" ? j.email : "";
  if (!id || !email) {
    throw new Error("Google profile missing id or email");
  }
  const given_name = typeof j?.given_name === "string" ? j.given_name : undefined;
  const family_name = typeof j?.family_name === "string" ? j.family_name : undefined;
  const name = typeof j?.name === "string" ? j.name : undefined;
  const picture = typeof j?.picture === "string" ? j.picture : undefined;
  return {
    id,
    email,
    verified_email: j?.verified_email === true,
    given_name,
    family_name,
    name,
    picture,
  };
}
