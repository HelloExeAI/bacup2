/**
 * Split deploy: marketing (e.g. bacup.com) vs app (e.g. app.bacup.com).
 * When `NEXT_PUBLIC_APP_ORIGIN` is set, CTAs point the browser at the app host for sign-in and post-login entry.
 */

const stripSlash = (s: string) => s.replace(/\/$/, "");

export function getAppOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  return raw ? stripSlash(raw) : "";
}

/** OAuth + session cookies must use the same origin you configure in Supabase redirect URLs. */
export function getAuthSiteOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  const app = getAppOrigin();
  if (app) return app;
  if (process.env.NEXT_PUBLIC_APP_URL?.trim().startsWith("http")) {
    return stripSlash(process.env.NEXT_PUBLIC_APP_URL.trim());
  }
  return "";
}

export function signInPagePath(): string {
  return "/signin";
}

export function signUpPagePath(): string {
  return "/signup";
}

/** Absolute URL to app sign-in (for marketing navbar when APP_ORIGIN is set). */
export function absoluteSignInUrl(): string {
  const base = getAppOrigin();
  return base ? `${base}${signInPagePath()}` : signInPagePath();
}

export function absoluteSignUpUrl(): string {
  const base = getAppOrigin();
  return base ? `${base}${signUpPagePath()}` : signUpPagePath();
}

export function absoluteDashboardUrl(): string {
  const base = getAppOrigin();
  return base ? `${base}/dashboard` : "/dashboard";
}

export function absoluteOnboardingUrl(): string {
  const base = getAppOrigin();
  return base ? `${base}/onboarding` : "/onboarding";
}
