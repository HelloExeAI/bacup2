import type { SupabaseClient } from "@supabase/supabase-js";

import {
  refreshMicrosoftAccessToken,
  type MicrosoftTokenResponse,
} from "@/lib/integrations/microsoft/microsoftTokenExchange";

export type MicrosoftConnectedRow = {
  id: string;
  account_email: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
};

export class MicrosoftIntegrationError extends Error {
  constructor(
    message: string,
    readonly code: "not_connected" | "reconnect_required" | "upstream",
  ) {
    super(message);
    this.name = "MicrosoftIntegrationError";
  }
}

export async function getValidMicrosoftAccessToken(
  supabase: SupabaseClient,
  userId: string,
  accountId?: string | null,
): Promise<{ accessToken: string; account: MicrosoftConnectedRow }> {
  let q = supabase
    .from("user_connected_accounts")
    .select("id, account_email, access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "microsoft");

  if (accountId) {
    q = q.eq("id", accountId);
  }

  const { data: rows, error } = await q.limit(1);
  if (error) throw error;
  const row = rows?.[0] as MicrosoftConnectedRow | undefined;
  if (!row) {
    throw new MicrosoftIntegrationError("No Microsoft account connected.", "not_connected");
  }

  const expiresMs = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  const refreshSkewMs = 90_000;
  if (row.access_token && expiresMs > Date.now() + refreshSkewMs) {
    return { accessToken: row.access_token, account: row };
  }

  if (!row.refresh_token) {
    throw new MicrosoftIntegrationError(
      "Microsoft session expired. Reconnect in Settings → Integrations.",
      "reconnect_required",
    );
  }

  const tokens: MicrosoftTokenResponse = await refreshMicrosoftAccessToken(row.refresh_token);
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
