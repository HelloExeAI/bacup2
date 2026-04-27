import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";
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
    const state = encodeMicrosoftOAuthState(user.id, returnTo);
    const redirectUri = microsoftRedirectUriFromRequest(req);

    const url = new URL(MICROSOFT_AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", [...MICROSOFT_OAUTH_SCOPES].join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("response_mode", "query");
    // Force account picker instead of silently using an existing browser session.
    url.searchParams.set("prompt", "select_account");

    return NextResponse.redirect(url.toString());
  } catch (e) {
    console.error("[microsoft/oauth/start]", e);
    return NextResponse.json({ error: "Failed to start Microsoft connect" }, { status: 500 });
  }
}
