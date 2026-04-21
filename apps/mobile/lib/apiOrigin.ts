import Constants from "expo-constants";

/** Base URL for Next.js API (no trailing slash). Used for mobile-only Bearer routes. */
export function getAppApiOrigin(): string {
  const extra = Constants.expoConfig?.extra as { appUrl?: string } | undefined;
  const raw = String(extra?.appUrl ?? process.env.EXPO_PUBLIC_APP_URL ?? "").trim();
  return raw.replace(/\/+$/, "");
}
