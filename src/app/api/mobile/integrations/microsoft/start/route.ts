import { NextResponse } from "next/server";

import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";
import { microsoftClientId, microsoftClientSecret, microsoftRedirectUriFromRequest } from "@/lib/integrations/microsoft/microsoftEnv";
import { MICROSOFT_AUTH_URL, MICROSOFT_OAUTH_SCOPES } from "@/lib/integrations/microsoft/oauthConstants";
import { encodeMicrosoftOAuthState } from "@/lib/integrations/microsoft/oauthState";

export const dynamic = "force-dynamic";

/** Mobile OAuth start: returns provider URL (no cookie session required). */
export async function GET(req: Request) {
  try {
    const clientId = microsoftClientId();
    const clientSecret = microsoftClientSecret();
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Microsoft OAuth is not configured." }, { status: 503 });
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

    const state = encodeMicrosoftOAuthState(user.id, returnTo);
    const redirectUri = microsoftRedirectUriFromRequest(req);

    const url = new URL(MICROSOFT_AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", [...MICROSOFT_OAUTH_SCOPES].join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("prompt", "select_account");

    return NextResponse.json({ url: url.toString() });
  } catch (e) {
    console.error("[mobile/microsoft/oauth/start]", e);
    return NextResponse.json({ error: "Failed to start Microsoft connect" }, { status: 500 });
  }
}

