import type { SupabaseClient } from "@supabase/supabase-js";

import { googleClientId, googleClientSecret, googleMobileOAuthClientId } from "@/lib/integrations/google/googleEnv";
import type { GoogleTokenResponse } from "@/lib/integrations/google/googleTokenExchange";
import { GOOGLE_TOKEN_URL } from "@/lib/integrations/google/oauthConstants";

function parseGoogleTokenResponse(j: Record<string, unknown> | null): GoogleTokenResponse {
  const access_token = typeof j?.access_token === "string" ? j.access_token : "";
  const expires_in = typeof j?.expires_in === "number" ? j.expires_in : 3600;
  if (!access_token) throw new Error("Google refresh missing access_token");
  return {
    access_token,
    expires_in,
    refresh_token: typeof j?.refresh_token === "string" ? j.refresh_token : undefined,
    scope: typeof j?.scope === "string" ? j.scope : undefined,
    token_type: typeof j?.token_type === "string" ? j.token_type : "Bearer",
  };
}

async function postGoogleTokenRefresh(body: URLSearchParams): Promise<{
  ok: boolean;
  json: Record<string, unknown> | null;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, json };
}

function refreshErrorMessage(json: Record<string, unknown> | null): string {
  const err = typeof json?.error === "string" ? json.error : "token_error";
  const desc = typeof json?.error_description === "string" ? json.error_description : "";
  return `Google refresh failed: ${err}${desc ? ` — ${desc}` : ""}`;
}

/**
 * Web OAuth issues refresh tokens bound to `GOOGLE_CLIENT_ID` + secret.
 * Expo (iOS) native OAuth issues tokens bound to the iOS client id — refresh **without** secret.
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const webId = googleClientId();
  const webSecret = googleClientSecret();
  const mobileId = googleMobileOAuthClientId();

  if (webId && webSecret) {
    const { ok, json } = await postGoogleTokenRefresh(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: webId,
        client_secret: webSecret,
      }),
    );
    if (ok && json) return parseGoogleTokenResponse(json);
    const oauthErr = typeof json?.error === "string" ? json.error : "";
    if (oauthErr === "unauthorized_client" && mobileId) {
      const second = await postGoogleTokenRefresh(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: mobileId,
        }),
      );
      if (second.ok && second.json) return parseGoogleTokenResponse(second.json);
      throw new Error(refreshErrorMessage(second.json));
    }
    throw new Error(refreshErrorMessage(json));
  }

  if (mobileId) {
    const { ok, json } = await postGoogleTokenRefresh(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: mobileId,
      }),
    );
    if (ok && json) return parseGoogleTokenResponse(json);
    throw new Error(refreshErrorMessage(json));
  }

  throw new Error("Google OAuth not configured (set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET and/or GOOGLE_MOBILE_OAUTH_CLIENT_ID).");
}

export type GoogleConnectedRow = {
  id: string;
  account_email: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
};

export class GoogleIntegrationError extends Error {
  constructor(
    message: string,
    readonly code: "not_connected" | "reconnect_required" | "upstream",
  ) {
    super(message);
    this.name = "GoogleIntegrationError";
  }
}

export async function getValidGoogleAccessToken(
  supabase: SupabaseClient,
  userId: string,
  accountId?: string | null,
): Promise<{ accessToken: string; account: GoogleConnectedRow }> {
  let q = supabase
    .from("user_connected_accounts")
    .select("id, account_email, access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "google");

  if (accountId) {
    q = q.eq("id", accountId);
  }

  const { data: rows, error } = await q.limit(1);
  if (error) throw error;
  const row = rows?.[0] as GoogleConnectedRow | undefined;
  if (!row) {
    throw new GoogleIntegrationError("No Google account connected.", "not_connected");
  }

  const expiresMs = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  const refreshSkewMs = 90_000;
  if (row.access_token && expiresMs > Date.now() + refreshSkewMs) {
    return { accessToken: row.access_token, account: row };
  }

  if (!row.refresh_token) {
    throw new GoogleIntegrationError(
      "Google session expired. Reconnect in Settings → Integrations.",
      "reconnect_required",
    );
  }

  const tokens = await refreshGoogleAccessToken(row.refresh_token);
  const newRefresh = tokens.refresh_token ?? row.refresh_token;
  const expiresAt = new Date(Date.now() + Math.max(60, tokens.expires_in) * 1000).toISOString();

  const { error: upErr } = await supabase
    .from("user_connected_accounts")
    .update({
      access_token: tokens.access_token,
      refresh_token: newRefresh,
      token_expires_at: expiresAt,
    })
    .eq("id", row.id)
    .eq("user_id", userId);

  if (upErr) throw upErr;

  return {
    accessToken: tokens.access_token,
    account: {
      ...row,
      access_token: tokens.access_token,
      refresh_token: newRefresh,
      token_expires_at: expiresAt,
    },
  };
}
