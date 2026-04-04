import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Allowed without a session (marketing, auth UI, OAuth return, logout). */
const ALLOW_UNAUTHED = [
  "/",
  "/pricing",
  "/signin",
  "/signup",
  "/login",
  "/auth/callback",
  "/auth/sign-out",
];

/** If already signed in, redirect away from auth entry points. */
const REDIRECT_WHEN_AUTHED = ["/login", "/signin", "/signup"];

function allowWithoutSession(pathname: string) {
  return ALLOW_UNAUTHED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function redirectAuthedAwayFrom(pathname: string) {
  return REDIRECT_WHEN_AUTHED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  /** Edge middleware must not throw — missing Vercel env vars cause MIDDLEWARE_INVOCATION_FAILED. */
  if (!url || !anon) {
    if (allowWithoutSession(pathname)) {
      return NextResponse.next();
    }
    const signin = req.nextUrl.clone();
    signin.pathname = "/signin";
    return NextResponse.redirect(signin);
  }

  let session: { user: unknown } | null = null;
  try {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              res.cookies.set(name, value, options);
            } catch {
              /* Edge can reject some cookie option shapes; session refresh still best-effort */
            }
          });
        },
      },
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("[middleware] getSession:", error.message);
    } else {
      session = data.session;
    }
  } catch (e) {
    console.error("[middleware] Supabase session failed:", e);
    if (allowWithoutSession(pathname)) {
      return NextResponse.next();
    }
    const signin = req.nextUrl.clone();
    signin.pathname = "/signin";
    return NextResponse.redirect(signin);
  }

  if (!session?.user && !allowWithoutSession(pathname)) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/signin";
    return NextResponse.redirect(redirectUrl);
  }

  if (session?.user && redirectAuthedAwayFrom(pathname)) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

