import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { googleClientId, googleClientSecret, googleRedirectUriFromRequest } from "@/lib/integrations/google/googleEnv";
import { GOOGLE_AUTH_URL, GOOGLE_OAUTH_SCOPES } from "@/lib/integrations/google/oauthConstants";
import { encodeGoogleOAuthState } from "@/lib/integrations/google/oauthState";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const clientId = googleClientId();
    const clientSecret = googleClientSecret();
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error:
            "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or GOOGLE_OAUTH_* equivalents) and optionally GOOGLE_OAUTH_REDIRECT_URI.",
        },
        { status: 503 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      const login = new URL("/signin", new URL(req.url).origin);
      return NextResponse.redirect(login);
    }

    const state = encodeGoogleOAuthState(user.id);
    const redirectUri = googleRedirectUriFromRequest(req);

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", [...GOOGLE_OAUTH_SCOPES].join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    // select_account: always show Google account chooser; consent: refresh_token on first link
    url.searchParams.set("prompt", "select_account consent");
    url.searchParams.set("include_granted_scopes", "true");

    return NextResponse.redirect(url.toString());
  } catch (e) {
    console.error("[google/oauth/start]", e);
    return NextResponse.json({ error: "Failed to start Google connect" }, { status: 500 });
  }
}
