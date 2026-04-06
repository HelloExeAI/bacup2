/** Paths allowed without a Supabase session (must stay in sync with middleware). */
const ALLOW_UNAUTHED = [
  "/",
  "/pricing",
  "/signin",
  "/signup",
  "/login",
  "/auth/callback",
  "/auth/sign-out",
] as const;

export function allowPathWithoutSession(pathname: string): boolean {
  return ALLOW_UNAUTHED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
