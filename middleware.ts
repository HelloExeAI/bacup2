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
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = req.nextUrl;

  if (!session?.user && !allowWithoutSession(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  if (session?.user && redirectAuthedAwayFrom(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

