import { getAppApiOrigin } from "@/lib/apiOrigin";
import type { BacupTierId, BillingInterval, SettingsPayload, SubscriptionStatus } from "@/lib/settingsTypes";

/** Thrown for non-2xx API responses so callers can branch on `status` (e.g. 404 → Supabase fallback). */
export class MobileHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "MobileHttpError";
    this.status = status;
  }
}

/** Non-OK responses may have an empty body; `res.json()` can be `null`. Never read `.error` off `null`. */
function messageFromErrorJson(j: unknown, fallback: string): string {
  if (j != null && typeof j === "object") {
    const o = j as { error?: unknown; message?: unknown };
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.error === "string" && o.error.trim()) {
      const code = o.error.trim();
      if (code === "account_not_found") {
        return "This account was not found. Go back and pick a connected account from the list.";
      }
      return code;
    }
  }
  return fallback;
}

function bearerHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

export async function fetchMobileUserSettings(accessToken: string): Promise<SettingsPayload> {
  const origin = getAppApiOrigin();
  if (!origin) throw new Error("Missing app URL (EXPO_PUBLIC_APP_URL).");
  const res = await fetch(`${origin}/api/mobile/user/settings`, {
    method: "GET",
    headers: bearerHeaders(accessToken),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { error?: string; details?: unknown } | SettingsPayload | null;
  if (!res.ok) {
    throw new MobileHttpError(res.status, messageFromErrorJson(j, `Load failed (${res.status})`));
  }
  if (j == null || typeof j !== "object" || !("settings" in j)) {
    throw new Error("Invalid settings response");
  }
  return j as SettingsPayload;
}

export async function patchMobileUserSettings(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<SettingsPayload> {
  const origin = getAppApiOrigin();
  if (!origin) throw new Error("Missing app URL (EXPO_PUBLIC_APP_URL).");
  const res = await fetch(`${origin}/api/mobile/user/settings`, {
    method: "PATCH",
    headers: { ...bearerHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { error?: string; details?: unknown } | SettingsPayload | null;
  if (!res.ok) {
    throw new MobileHttpError(res.status, messageFromErrorJson(j, `Save failed (${res.status})`));
  }
  if (j == null || typeof j !== "object" || !("settings" in j)) {
    throw new Error("Invalid settings response");
  }
  return j as SettingsPayload;
}

export async function postMobileUserAvatar(accessToken: string, imageBytes: ArrayBuffer, filename: string): Promise<string> {
  const origin = getAppApiOrigin();
  if (!origin) throw new Error("Missing app URL (EXPO_PUBLIC_APP_URL).");

  const blob = new Blob([imageBytes], { type: "application/octet-stream" });
  const fd = new FormData();
  fd.append("file", blob, filename);

  const res = await fetch(`${origin}/api/mobile/user/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    body: fd,
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { error?: string; avatar_url?: string } | null;
  if (!res.ok) throw new MobileHttpError(res.status, messageFromErrorJson(j, `Upload failed (${res.status})`));
  const url = j && typeof j.avatar_url === "string" ? j.avatar_url.trim() : "";
  if (!url) throw new Error("Invalid avatar response");
  return url;
}

export async function deleteMobileUserAvatar(accessToken: string): Promise<void> {
  const origin = getAppApiOrigin();
  if (!origin) throw new Error("Missing app URL (EXPO_PUBLIC_APP_URL).");
  const res = await fetch(`${origin}/api/mobile/user/avatar`, {
    method: "DELETE",
    headers: bearerHeaders(accessToken),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new MobileHttpError(res.status, messageFromErrorJson(j, `Remove failed (${res.status})`));
}

export async function postMobileUserPassword(accessToken: string, newPassword: string): Promise<void> {
  const origin = getAppApiOrigin();
  if (!origin) throw new Error("Missing app URL (EXPO_PUBLIC_APP_URL).");
  const res = await fetch(`${origin}/api/mobile/user/password`, {
    method: "POST",
    headers: { ...bearerHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new MobileHttpError(res.status, messageFromErrorJson(j, `Password update failed (${res.status})`));
}

export type TeamSetupPerson = {
  user_id: string;
  label: string;
  team_member_id: string | null;
  can_manage_business_setup: boolean;
  department: string | null;
};

export type TeamSetupPayload = {
  workspace_owner_id: string;
  can_edit: boolean;
  is_founder_viewer: boolean;
  people: TeamSetupPerson[];
};

export async function fetchMobileTeamSetup(accessToken: string): Promise<TeamSetupPayload> {
  const origin = getAppApiOrigin();
  if (!origin) throw new Error("Missing app URL (EXPO_PUBLIC_APP_URL).");
  const res = await fetch(`${origin}/api/mobile/workspace/team-setup`, {
    method: "GET",
    headers: bearerHeaders(accessToken),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | TeamSetupPayload | null;
  if (!res.ok) {
    throw new MobileHttpError(res.status, messageFromErrorJson(j, `Team setup failed (${res.status})`));
  }
  if (j == null || typeof j !== "object" || !("people" in j)) {
    throw new Error("Invalid team setup response");
  }
  return j as TeamSetupPayload;
}

export async function patchMobileTeamSetup(accessToken: string, body: Record<string, unknown>): Promise<void> {
  const origin = getAppApiOrigin();
  if (!origin) throw new Error("Missing app URL (EXPO_PUBLIC_APP_URL).");
  const res = await fetch(`${origin}/api/mobile/workspace/team-setup`, {
    method: "PATCH",
    headers: { ...bearerHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new MobileHttpError(res.status, messageFromErrorJson(j, `Save failed (${res.status})`));
}

export type CurrentPlanApi = {
  plan: BacupTierId;
  status: SubscriptionStatus;
  nextBillingDate: string | null;
  billingInterval: BillingInterval;
  askBacupAddon: boolean;
  subscriptionStartedAtIso: string | null;
  usage: {
    aiTokens: number;
    aiTokensLimit: number;
    voiceMinutes: number;
    voiceMinutesLimit: number;
    openaiAddonBalance: number;
    voiceAddonMinutes: number;
  };
  periodKey: string;
  resetsAtIso: string;
};

export type MobileEmailTodayMessage = {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  error?: boolean;
};

export type MobileEmailTodaySection = {
  accountId: string;
  provider: string;
  accountEmail: string;
  displayName: string | null;
  messages: MobileEmailTodayMessage[];
  error: string | null;
};

export type MobileEmailTodayResponse = {
  date: string;
  sections: MobileEmailTodaySection[];
};

/** Local calendar day as YYYY-MM-DD (device timezone). */
export function localCalendarYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function fetchMobileEmailToday(
  accessToken: string,
  opts?: { dateYmd?: string; maxResults?: number; accountId?: string },
): Promise<MobileEmailTodayResponse> {
  const origin = getAppApiOrigin();
  if (!origin) throw new Error("Missing app URL (EXPO_PUBLIC_APP_URL).");
  const q = new URLSearchParams();
  q.set("date", (opts?.dateYmd ?? localCalendarYmd()).trim());
  if (opts?.maxResults != null) q.set("maxResults", String(opts.maxResults));
  if (opts?.accountId?.trim()) q.set("accountId", opts.accountId.trim());
  const res = await fetch(`${origin}/api/mobile/email/today?${q}`, {
    method: "GET",
    headers: bearerHeaders(accessToken),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | MobileEmailTodayResponse | null;
  if (!res.ok) {
    const fallback =
      res.status === 404
        ? "Email API not found (404). Deploy the latest server, or set EXPO_PUBLIC_APP_URL to your dev machine (same host as `npm run dev`)."
        : `Email load failed (${res.status})`;
    throw new MobileHttpError(res.status, messageFromErrorJson(j, fallback));
  }
  if (j == null || typeof j !== "object" || !("sections" in j)) {
    throw new Error("Invalid email response");
  }
  return j as MobileEmailTodayResponse;
}

export type MobileOverviewInboxBriefAccount = {
  accountId: string;
  accountEmail: string;
  domainKind: "consumer" | "workspace";
  messageCount?: number;
  lines: string[];
  source: "skipped_consumer" | "template_empty" | "openai" | "fallback";
};

export type MobileOverviewInboxBriefResponse = {
  date: string;
  accounts: MobileOverviewInboxBriefAccount[];
};

export async function fetchMobileOverviewInboxBrief(
  accessToken: string,
  opts?: { dateYmd?: string },
): Promise<MobileOverviewInboxBriefResponse> {
  const origin = getAppApiOrigin();
  if (!origin) throw new Error("Missing app URL (EXPO_PUBLIC_APP_URL).");
  const q = new URLSearchParams();
  q.set("date", (opts?.dateYmd ?? localCalendarYmd()).trim());
  const res = await fetch(`${origin}/api/mobile/overview/inbox-brief?${q}`, {
    method: "GET",
    headers: bearerHeaders(accessToken),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { error?: string } | MobileOverviewInboxBriefResponse | null;
  if (!res.ok) {
    throw new MobileHttpError(res.status, messageFromErrorJson(j, `Inbox brief failed (${res.status})`));
  }
  if (j == null || typeof j !== "object" || !("accounts" in j)) {
    throw new Error("Invalid inbox brief response");
  }
  return j as MobileOverviewInboxBriefResponse;
}

export async function fetchMobileCurrentPlan(accessToken: string): Promise<CurrentPlanApi> {
  const origin = getAppApiOrigin();
  if (!origin) throw new Error("Missing app URL (EXPO_PUBLIC_APP_URL).");
  const res = await fetch(`${origin}/api/mobile/billing/current-plan`, {
    method: "GET",
    headers: bearerHeaders(accessToken),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { error?: string } | CurrentPlanApi | null;
  if (!res.ok) {
    throw new MobileHttpError(res.status, messageFromErrorJson(j, `Billing load failed (${res.status})`));
  }
  if (j == null || typeof j !== "object" || !("plan" in j)) {
    throw new Error("Invalid billing response");
  }
  return j as CurrentPlanApi;
}
