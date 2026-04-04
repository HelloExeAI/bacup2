import type { SupabaseClient } from "@supabase/supabase-js";

import { googleClientId, googleClientSecret } from "@/lib/integrations/google/googleEnv";
import type { GoogleTokenResponse } from "@/lib/integrations/google/googleTokenExchange";
import { GOOGLE_TOKEN_URL } from "@/lib/integrations/google/oauthConstants";

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth not configured");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
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
    throw new Error(`Google refresh failed: ${err}${desc ? ` — ${desc}` : ""}`);
  }

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
