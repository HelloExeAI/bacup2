import Constants from "expo-constants";

function inferredLanHost(): string | null {
  // Expo often exposes the dev host as "<lan-ip>:<metro-port>".
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    "";
  const raw = String(hostUri ?? "").trim();
  if (!raw) return null;
  const host = raw.split("/")[0]?.trim() || "";
  const hostname = host.split(":")[0]?.trim() || "";
  return hostname || null;
}

/**
 * Base URL for Next.js API (no path, no trailing slash).
 * If `EXPO_PUBLIC_APP_URL` is a full page URL (e.g. `https://site.com/app/dashboard`),
 * only the origin is kept so requests hit `/api/...` on the Next host, not `/app/api/...`.
 */
export function getAppApiOrigin(): string {
  const extra = Constants.expoConfig?.extra as { appUrl?: string } | undefined;
  const raw = String(extra?.appUrl ?? process.env.EXPO_PUBLIC_APP_URL ?? "").trim();
  if (!raw) return "";

  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw) ? raw : `https://${raw}`;

  try {
    const u = new URL(withScheme);
    if (!u.hostname) return raw.replace(/\/+$/, "");
    const isLocalhost = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (isLocalhost) {
      const isIosSimulator = Boolean((Constants as any)?.platform?.ios?.simulator);
      // iOS Simulator can usually reach the dev machine via localhost; only rewrite for real devices.
      if (isIosSimulator) return `${u.protocol}//${u.host}`;
      const lan = inferredLanHost();
      // On a physical device, localhost points to the phone, not your laptop.
      if (lan) return `${u.protocol}//${lan}${u.port ? `:${u.port}` : ""}`;
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}
