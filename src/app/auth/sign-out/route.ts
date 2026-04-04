import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * Clears Supabase auth cookies (including httpOnly cookies set during OAuth).
 * Client-side `signOut()` alone cannot remove those, so middleware kept seeing a session.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const { url, anonKey } = getSupabaseEnv();

    const json = NextResponse.json({ ok: true });
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            json.cookies.set(name, value, options);
          });
        },
      },
    });

    await supabase.auth.signOut({ scope: "global" });
    return json;
  } catch (e) {
    console.error("[auth/sign-out POST]", e);
    return NextResponse.json({ ok: false, error: "sign_out_failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const { url, anonKey } = getSupabaseEnv();
    const origin = new URL(req.url).origin;

    const redirect = NextResponse.redirect(new URL("/signin", origin));
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            redirect.cookies.set(name, value, options);
          });
        },
      },
    });

    await supabase.auth.signOut({ scope: "global" });
    return redirect;
  } catch (e) {
    console.error("[auth/sign-out GET]", e);
    return NextResponse.redirect(new URL("/signin", new URL(req.url).origin));
  }
}
