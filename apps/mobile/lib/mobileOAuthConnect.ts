import { getSupabase } from "@/lib/supabase";
import { readMobileOAuthEnv } from "@/lib/env";

type Provider = "google" | "microsoft";

function nowIsoPlusSeconds(sec: number) {
  return new Date(Date.now() + Math.max(30, sec) * 1000).toISOString();
}

function googleReversedClientId(googleClientId: string): string {
  // 123-abc.apps.googleusercontent.com -> com.googleusercontent.apps.123-abc
  const prefix = googleClientId.replace(/\.apps\.googleusercontent\.com$/i, "").trim();
  return `com.googleusercontent.apps.${prefix}`;
}

function googleRedirectUri(googleClientId: string): string {
  const scheme = googleReversedClientId(googleClientId);
  // Google iOS installed-app redirect must be EXACTLY:
  // com.googleusercontent.apps.<CLIENT_ID_PREFIX>:/oauthredirect
  // (note the single slash after the colon; `makeRedirectUri` produces `://` which Google rejects)
  return `${scheme}:/oauthredirect`;
}

function redirectUri(): string {
  const AuthSession = loadAuthSession();
  // Uses app scheme from app.config.ts: scheme = "bacup"
  // Keep this stable so it can be whitelisted in Google/Microsoft consoles.
  return AuthSession.makeRedirectUri({ scheme: "bacup", path: "redirect" });
}

type AuthSessionMod = typeof import("expo-auth-session");

function loadAuthSession(): AuthSessionMod {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-auth-session") as AuthSessionMod;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      "OAuth isn’t available in this build yet. Rebuild the iOS app so native modules link.\n\n" +
        `Details: ${msg}`,
    );
  }
}

async function upsertConnectedAccount(row: {
  user_id: string;
  provider: Provider;
  account_email: string;
  provider_subject: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string | null;
  display_name?: string | null;
}) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  // We rely on RLS allowing the authenticated user to upsert their own rows.
  const { error } = await sb
    .from("user_connected_accounts")
    .upsert(row, { onConflict: "user_id,provider,account_email" });
  if (error) throw new Error(error.message);
}

let oauthInFlight: Promise<void> | null = null;

async function runSingleOAuthFlow(fn: () => Promise<void>): Promise<void> {
  if (oauthInFlight) return oauthInFlight;
  oauthInFlight = (async () => {
    try {
      await fn();
    } finally {
      oauthInFlight = null;
    }
  })();
  return oauthInFlight;
}

export async function connectGoogleMobile(userId: string): Promise<void> {
  return runSingleOAuthFlow(async () => {
    const AuthSession = loadAuthSession();
    const { googleClientId } = readMobileOAuthEnv();
    if (!googleClientId) throw new Error("Missing EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID.");

    const discovery = await AuthSession.fetchDiscoveryAsync("https://accounts.google.com");

  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
  ];

  const req = new AuthSession.AuthRequest({
    clientId: googleClientId,
    redirectUri: googleRedirectUri(googleClientId),
    scopes,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: {
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
    },
  });

  await req.makeAuthUrlAsync(discovery);
  const res = await req.promptAsync(discovery);
  if (res.type !== "success" || !res.params?.code) {
    if (res.type === "dismiss" || res.type === "cancel") return;
    if (res.type === "error") {
      const err = String((res as any).params?.error || "OAuth failed");
      const desc = String((res as any).params?.error_description || "");
      throw new Error(
        `Google OAuth error: ${err}${desc ? ` — ${desc}` : ""}\n\nRedirect URI: ${googleRedirectUri(googleClientId)}`,
      );
    }
    throw new Error(`Google OAuth failed.\n\nRedirect URI: ${googleRedirectUri(googleClientId)}`);
  }

  const tokenRes = await AuthSession.exchangeCodeAsync(
    {
      clientId: googleClientId,
      code: res.params.code,
      redirectUri: googleRedirectUri(googleClientId),
      extraParams: req.codeVerifier ? { code_verifier: req.codeVerifier } : undefined,
    },
    discovery,
  );

  const accessToken = String((tokenRes as any).accessToken || (tokenRes as any).access_token || "").trim();
  if (!accessToken) throw new Error("Google did not return an access token.");

  const refreshTokenRaw = (tokenRes as any).refreshToken ?? (tokenRes as any).refresh_token ?? null;
  const refreshToken = typeof refreshTokenRaw === "string" && refreshTokenRaw.trim() ? refreshTokenRaw.trim() : null;
  const expiresIn = Number((tokenRes as any).expiresIn ?? (tokenRes as any).expires_in ?? 0) || 0;
  const scopesStr =
    typeof (tokenRes as any).scope === "string" ? String((tokenRes as any).scope).trim() : scopes.join(" ");

  // Fetch user email to key the row.
  const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const me = await meRes.json().catch(() => null);
  if (!meRes.ok) throw new Error(String((me as any)?.error?.message || "Failed to load Google profile."));
  const email = String((me as any)?.email || "").trim().toLowerCase();
  const subject = String((me as any)?.id || "").trim() || null;
  const name = String((me as any)?.name || "").trim() || null;
  if (!email) throw new Error("Google profile missing email.");

    await upsertConnectedAccount({
      user_id: userId,
      provider: "google",
      account_email: email,
      provider_subject: subject,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresIn ? nowIsoPlusSeconds(expiresIn) : null,
      scopes: scopesStr || null,
      display_name: name,
    });
  });
}

export async function connectMicrosoftMobile(userId: string): Promise<void> {
  return runSingleOAuthFlow(async () => {
    const AuthSession = loadAuthSession();
    const { microsoftClientId, microsoftTenantId } = readMobileOAuthEnv();
    if (!microsoftClientId) throw new Error("Missing EXPO_PUBLIC_MICROSOFT_OAUTH_CLIENT_ID.");

  const tenant = microsoftTenantId || "common";
  const discovery = await AuthSession.fetchDiscoveryAsync(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0`,
  );

  const scopes = ["openid", "profile", "email", "offline_access", "User.Read", "Calendars.Read"];

  const req = new AuthSession.AuthRequest({
    clientId: microsoftClientId,
    redirectUri: redirectUri(),
    scopes,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { prompt: "select_account" },
  });

  await req.makeAuthUrlAsync(discovery);
  const res = await req.promptAsync(discovery);
  if (res.type !== "success" || !res.params?.code) {
    if (res.type === "dismiss" || res.type === "cancel") return;
    if (res.type === "error") {
      const err = String((res as any).params?.error || "OAuth failed");
      const desc = String((res as any).params?.error_description || "");
      throw new Error(
        `Microsoft OAuth error: ${err}${desc ? ` — ${desc}` : ""}\n\nRedirect URI: ${redirectUri()}`,
      );
    }
    throw new Error(`Microsoft OAuth failed.\n\nRedirect URI: ${redirectUri()}`);
  }

  const tokenRes = await AuthSession.exchangeCodeAsync(
    {
      clientId: microsoftClientId,
      code: res.params.code,
      redirectUri: redirectUri(),
      extraParams: req.codeVerifier ? { code_verifier: req.codeVerifier } : undefined,
    },
    discovery,
  );

  const accessToken = String((tokenRes as any).accessToken || (tokenRes as any).access_token || "").trim();
  if (!accessToken) throw new Error("Microsoft did not return an access token.");

  const refreshTokenRaw = (tokenRes as any).refreshToken ?? (tokenRes as any).refresh_token ?? null;
  const refreshToken = typeof refreshTokenRaw === "string" && refreshTokenRaw.trim() ? refreshTokenRaw.trim() : null;
  const expiresIn = Number((tokenRes as any).expiresIn ?? (tokenRes as any).expires_in ?? 0) || 0;
  const scopesStr = typeof (tokenRes as any).scope === "string" ? String((tokenRes as any).scope).trim() : scopes.join(" ");

  const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const me = await meRes.json().catch(() => null);
  if (!meRes.ok) throw new Error(String((me as any)?.error?.message || "Failed to load Microsoft profile."));
  const email = String((me as any)?.mail || (me as any)?.userPrincipalName || "").trim().toLowerCase();
  const subject = String((me as any)?.id || "").trim() || null;
  const name = String((me as any)?.displayName || "").trim() || null;
  if (!email) throw new Error("Microsoft profile missing email.");

    await upsertConnectedAccount({
      user_id: userId,
      provider: "microsoft",
      account_email: email,
      provider_subject: subject,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresIn ? nowIsoPlusSeconds(expiresIn) : null,
      scopes: scopesStr || null,
      display_name: name,
    });
  });
}

