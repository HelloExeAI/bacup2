import { NextResponse } from "next/server";

import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";
import { googleClientId, googleClientSecret, googleRedirectUriFromRequest } from "@/lib/integrations/google/googleEnv";
import { GOOGLE_AUTH_URL, GOOGLE_OAUTH_SCOPES } from "@/lib/integrations/google/oauthConstants";
import { encodeGoogleOAuthState } from "@/lib/integrations/google/oauthState";

export const dynamic = "force-dynamic";

/** Mobile OAuth start: returns provider URL (no cookie session required). */
export async function GET(req: Request) {
  try {
    const clientId = googleClientId();
    const clientSecret = googleClientSecret();
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 503 });
    }

    const auth = supabaseFromBearer(req);
    if (!auth) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
    const {
      data: { user },
      error: userErr,
    } = await auth.auth.getUser();
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
  } catch (e) {
    console.error("[mobile/google/oauth/start]", e);
    return NextResponse.json({ error: "Failed to start Google connect" }, { status: 500 });
  }
}

