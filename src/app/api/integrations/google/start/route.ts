import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";
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

    const accept = req.headers.get("accept") || "";
    const wantsJson = accept.includes("application/json");

    // Mobile: allow Bearer auth (no cookie session) and return JSON with URL.
    const bearer = supabaseFromBearer(req);
    if (bearer) {
      const {
        data: { user },
        error: userErr,
      } = await bearer.auth.getUser();
      if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const { searchParams } = new URL(req.url);
      const returnTo = searchParams.get("return_to");
      const state = encodeGoogleOAuthState(user.id, returnTo);
      const redirectUri = googleRedirectUriFromRequest(req);

      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", [...GOOGLE_OAUTH_SCOPES].join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "select_account consent");
      url.searchParams.set("include_granted_scopes", "true");

      return NextResponse.json({ url: url.toString() });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      if (wantsJson) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const login = new URL("/signin", new URL(req.url).origin);
      return NextResponse.redirect(login);
    }

    const { searchParams } = new URL(req.url);
    const returnTo = searchParams.get("return_to");
    const state = encodeGoogleOAuthState(user.id, returnTo);
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
