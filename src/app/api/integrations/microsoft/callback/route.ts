import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { microsoftRedirectUriFromRequest } from "@/lib/integrations/microsoft/microsoftEnv";
import {
  exchangeMicrosoftAuthorizationCode,
  fetchMicrosoftUserProfile,
} from "@/lib/integrations/microsoft/microsoftTokenExchange";
import { decodeMicrosoftOAuthState } from "@/lib/integrations/microsoft/oauthState";
import { mergePrimaryOAuthIntoProfile, uploadMicrosoftGraphPhotoToAvatar } from "@/lib/profile/mergeOAuthProfile";

export const dynamic = "force-dynamic";

function finishRedirect(req: Request, query: Record<string, string>, path = "/scratchpad") {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(req.url).origin;
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url.toString());
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const err = searchParams.get("error");
  const errDesc = searchParams.get("error_description");
  if (err) {
    console.warn("[microsoft/oauth/callback] provider error", err, errDesc);
    return finishRedirect(req, {
      integrations: "microsoft_error",
      reason: err,
    });
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) {
    return finishRedirect(req, { integrations: "microsoft_error", reason: "missing_code" });
  }

  let stateUserId: string;
  try {
    stateUserId = decodeMicrosoftOAuthState(state).userId;
  } catch {
    return finishRedirect(req, { integrations: "microsoft_error", reason: "bad_state" });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user || user.id !== stateUserId) {
    return finishRedirect(req, { integrations: "microsoft_error", reason: "session" });
  }

  try {
    const redirectUri = microsoftRedirectUriFromRequest(req);
    const tokens = await exchangeMicrosoftAuthorizationCode(code, redirectUri);
    const profile = await fetchMicrosoftUserProfile(tokens.access_token);

    const expiresAt = new Date(Date.now() + Math.max(60, tokens.expires_in) * 1000).toISOString();

    const { data: existing } = await supabase
      .from("user_connected_accounts")
      .select("id, refresh_token")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .eq("account_email", profile.email)
      .maybeSingle();

    const refreshToken = tokens.refresh_token ?? (existing as { refresh_token?: string } | null)?.refresh_token ?? null;

    const row = {
      user_id: user.id,
      provider: "microsoft" as const,
      account_email: profile.email,
      provider_subject: profile.id,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      scopes: tokens.scope ?? null,
    };

    if (existing?.id) {
      const { error: upErr } = await supabase
        .from("user_connected_accounts")
        .update({
          provider_subject: row.provider_subject,
          access_token: row.access_token,
          refresh_token: row.refresh_token,
          token_expires_at: row.token_expires_at,
          scopes: row.scopes,
        })
        .eq("id", existing.id)
        .eq("user_id", user.id);

      if (upErr) throw upErr;
    } else {
      const { error: insErr } = await supabase.from("user_connected_accounts").insert(row);
      if (insErr) {
        if (insErr.code === "23505") {
          const { error: upErr2 } = await supabase
            .from("user_connected_accounts")
            .update({
              provider_subject: row.provider_subject,
              access_token: row.access_token,
              refresh_token: row.refresh_token,
              token_expires_at: row.token_expires_at,
              scopes: row.scopes,
            })
            .eq("user_id", user.id)
            .eq("provider", "microsoft")
            .eq("account_email", profile.email);
          if (upErr2) throw upErr2;
        } else {
          throw insErr;
        }
      }
    }

    let avatarPublicUrl: string | null = null;
    try {
      avatarPublicUrl = await uploadMicrosoftGraphPhotoToAvatar(supabase, user.id, tokens.access_token);
    } catch {
      /* optional */
    }

    await mergePrimaryOAuthIntoProfile(supabase, {
      userId: user.id,
      authEmail: user.email,
      oauthEmail: profile.email,
      patch: {
        first_name: profile.givenName,
        last_name: profile.surname,
        full_name: profile.displayName,
        avatar_url: avatarPublicUrl,
      },
    });

    return finishRedirect(req, { integrations: "microsoft_connected" }, "/scratchpad");
  } catch (e) {
    console.error("[microsoft/oauth/callback]", e);
    return finishRedirect(req, { integrations: "microsoft_error", reason: "exchange" });
  }
}
