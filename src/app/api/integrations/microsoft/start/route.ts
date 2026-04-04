import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { microsoftClientId, microsoftClientSecret, microsoftRedirectUriFromRequest } from "@/lib/integrations/microsoft/microsoftEnv";
import { MICROSOFT_AUTH_URL, MICROSOFT_OAUTH_SCOPES } from "@/lib/integrations/microsoft/oauthConstants";
import { encodeMicrosoftOAuthState } from "@/lib/integrations/microsoft/oauthState";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const clientId = microsoftClientId();
    const clientSecret = microsoftClientSecret();
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error:
            "Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET (and optional MICROSOFT_OAUTH_REDIRECT_URI).",
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

    const state = encodeMicrosoftOAuthState(user.id);
    const redirectUri = microsoftRedirectUriFromRequest(req);

    const url = new URL(MICROSOFT_AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", [...MICROSOFT_OAUTH_SCOPES].join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("response_mode", "query");

    return NextResponse.redirect(url.toString());
  } catch (e) {
    console.error("[microsoft/oauth/start]", e);
    return NextResponse.json({ error: "Failed to start Microsoft connect" }, { status: 500 });
  }
}
