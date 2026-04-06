import { absoluteSignInUrl } from "@/lib/marketing/urls";

/**
 * Full URL for sign-in after logout. Uses NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_APP_ORIGIN when set
 * (e.g. https://www.thebacup.com/signin); otherwise current origin + /signin.
 */
export function getSignOutRedirectHref(): string {
  if (typeof window === "undefined") return "/signin";
  const u = absoluteSignInUrl();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const path = u.startsWith("/") ? u : `/${u}`;
  return `${window.location.origin}${path}`;
}
