/**
 * Production domain for Bacup: https://www.thebacup.com
 * Configure the same value as NEXT_PUBLIC_APP_URL on Vercel (HTTPS).
 * Browsers and OAuth providers expect HTTPS in production; hosts usually redirect HTTP → HTTPS.
 */
export const BACUP_CANONICAL_HOST = "www.thebacup.com";

const CANONICAL_ORIGIN = `https://${BACUP_CANONICAL_HOST}`;

/**
 * Public site origin for metadata, callbacks, and absolute links when env is unset.
 * Prefer setting NEXT_PUBLIC_APP_URL in every deployed environment.
 */
export function defaultSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ?? "";
  if (raw.startsWith("http")) {
    try {
      return new URL(raw).origin;
    } catch {
      /* use canonical */
    }
  }
  return CANONICAL_ORIGIN;
}

export function defaultMetadataBase(): URL {
  return new URL(defaultSiteOrigin());
}
