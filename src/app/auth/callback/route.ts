import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect target for Supabase Auth (Google / Azure).
 * Configure the same URL under Authentication → URL configuration → Redirect URLs.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/dashboard";
  const next = nextRaw.startsWith("/") ? nextRaw : "/dashboard";

  const redirectLogin = (msg?: string) => {
    const u = new URL("/signin", origin);
    if (msg) u.searchParams.set("oauth_error", msg);
    return NextResponse.redirect(u);
  };

  if (!code) return redirectLogin("missing_code");

  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();
  const response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectLogin(error.message);
  }

  return response;
}
