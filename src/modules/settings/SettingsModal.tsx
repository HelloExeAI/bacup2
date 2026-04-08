"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import posthog from "posthog-js";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMyProfile } from "@/lib/supabase/queries";
import {
  NOTIFICATION_SOUND_OPTIONS,
  coerceNotificationSoundId,
  playNotificationSound,
} from "@/lib/notifications/notificationSounds";
import { normalizeUserSettingsRow } from "@/modules/settings/normalizeUserSettings";
import { INTERNATIONAL_DIAL_CODES, splitLegacyPhone } from "@/modules/settings/internationalDialCodes";
import { DEEPGRAM_LANGUAGE_OPTIONS } from "@/modules/settings/deepgramLanguages";
import { performAppSignOut } from "@/lib/auth/clientSignOut";
import { BillingPage } from "@/modules/settings/billing/BillingPage";
import { LocationTimezoneSection } from "@/modules/settings/LocationTimezoneSection";
import { ProfileAvatarEditor } from "@/modules/settings/ProfileAvatarEditor";
import type { ConnectedAccountRow, SettingsPayload, UserSettingsRow } from "@/modules/settings/types";
import { ImapConnectModal } from "@/modules/settings/ImapConnectModal";
import { useClockPreferencesStore } from "@/store/clockPreferencesStore";
import { useNotificationSoundStore } from "@/store/notificationSoundStore";
import { syncPosthogPerson } from "@/lib/posthog-person";
import { useUserStore, type Profile } from "@/store/userStore";

export type SettingsTabId =
  | "account"
  | "preferences"
  | "security"
  | "ai"
  | "voice"
  | "notifications"
  | "integrations"
  | "team"
  | "billing";

type TabId = SettingsTabId;

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

async function ensureProfileRowClient(supabase: SupabaseClient, user: User) {
  const { data: existing, error: exErr } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (exErr) throw exErr;
  if (existing) return;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const metaName =
    meta && typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : null;
  const fromEmail = user.email?.split("@")[0]?.trim() || null;
  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    name: metaName ?? fromEmail,
    role: "member",
  });
  if (error) {
    const code = "code" in error ? String((error as { code?: string }).code) : "";
    const msg = String((error as { message?: string }).message || "").toLowerCase();
    if (code === "23505" || msg.includes("duplicate")) return;
    throw error;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#6D665F] dark:text-[hsl(35_18%_78%)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-[#E0DDD6]/80 bg-white/60 px-3 py-2 dark:border-[hsl(35_10%_26%)] dark:bg-black/15">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description ? <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
          checked ? "border-emerald-600/50 bg-emerald-500/90" : "border-border bg-muted",
          disabled ? "opacity-50" : "",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "left-6" : "left-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function ConnectedAccountDisplayNameEditor({
  account,
  disabled,
  onSave,
}: {
  account: ConnectedAccountRow;
  disabled: boolean;
  onSave: (id: string, value: string) => void | Promise<void>;
}) {
  const [value, setValue] = React.useState(account.display_name ?? "");
  React.useEffect(() => {
    setValue(account.display_name ?? "");
  }, [account.id, account.display_name]);

  return (
    <div className="mt-2 space-y-1 border-t border-[#E0DDD6]/80 pt-2 dark:border-[hsl(35_10%_26%)]">
      <div className="text-[10px] font-medium text-muted-foreground">Display name</div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-[10rem] max-w-md flex-1"
          placeholder="Shown in Scratchpad Mail (optional)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void onSave(account.id, value);
            }
          }}
        />
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => void onSave(account.id, value)}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function SettingsModal({
  open,
  onClose,
  initialTab,
}: {
  open: boolean;
  onClose: () => void;
  /** When opening programmatically (e.g. “Connect Google” from scratchpad), land on this tab once. */
  initialTab?: SettingsTabId | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const integrationReturnKeyRef = React.useRef<string | null>(null);
  const [tab, setTab] = React.useState<TabId>("account");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saveNotice, setSaveNotice] = React.useState<string | null>(null);
  const saveNoticeClearRef = React.useRef<number | null>(null);

  const flashSaveNotice = React.useCallback((message: string) => {
    if (saveNoticeClearRef.current != null) {
      window.clearTimeout(saveNoticeClearRef.current);
      saveNoticeClearRef.current = null;
    }
    setSaveNotice(message);
    saveNoticeClearRef.current = window.setTimeout(() => {
      setSaveNotice(null);
      saveNoticeClearRef.current = null;
    }, 5000);
  }, []);

  React.useEffect(
    () => () => {
      if (saveNoticeClearRef.current != null) window.clearTimeout(saveNoticeClearRef.current);
    },
    [],
  );

  React.useEffect(() => {
    if (!open || !initialTab) return;
    setTab(initialTab);
  }, [open, initialTab]);

  const [payload, setPayload] = React.useState<SettingsPayload | null>(null);

  const [firstName, setFirstName] = React.useState("");
  const [middleName, setMiddleName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phoneCountryCode, setPhoneCountryCode] = React.useState("+1");
  const [phoneNational, setPhoneNational] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [timezone, setTimezone] = React.useState("UTC");
  const [avatarUrl, setAvatarUrl] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const [settings, setSettings] = React.useState<UserSettingsRow | null>(null);
  const [imapModalOpen, setImapModalOpen] = React.useState(false);

  const applyPayloadToForm = React.useCallback((p: SettingsPayload) => {
    setPayload(p);
    setFirstName(p.profile.first_name ?? "");
    setMiddleName(p.profile.middle_name ?? "");
    setLastName(p.profile.last_name ?? "");
    setDisplayName(p.profile.display_name ?? p.profile.name ?? "");
    setEmail(p.email ?? "");
    if (p.profile.phone_country_code) {
      setPhoneCountryCode(p.profile.phone_country_code);
      setPhoneNational((p.profile.phone ?? "").replace(/\D/g, ""));
    } else {
      const split = splitLegacyPhone(p.profile.phone);
      setPhoneCountryCode(split.code);
      setPhoneNational(split.national);
    }
    setLocation(p.profile.location ?? "");
    setTimezone(p.profile.timezone ?? "UTC");
    setAvatarUrl(p.profile.avatar_url ?? "");
    setSettings(p.settings);
    useNotificationSoundStore.getState().setSoundId(coerceNotificationSoundId(p.settings.notification_sound));
    useClockPreferencesStore.getState().hydrateFromSettings(p.settings);
  }, []);

  const syncUserStoreFromPayload = React.useCallback((p: SettingsPayload) => {
    const role = (p.profile.role as Profile["role"]) || "member";
    const prev = useUserStore.getState().profile;
    const created =
      p.profile.created_at?.trim() ||
      prev?.created_at ||
      new Date().toISOString();
    const next: Profile = {
      id: p.profile.id,
      name: p.profile.name,
      role,
      created_at: created,
      phone: p.profile.phone,
      phone_country_code: p.profile.phone_country_code,
      timezone: p.profile.timezone,
      location: p.profile.location,
      avatar_url: p.profile.avatar_url,
      first_name: p.profile.first_name,
      middle_name: p.profile.middle_name,
      last_name: p.profile.last_name,
      display_name: p.profile.display_name,
    };
    useUserStore.getState().setProfile(next);
  }, []);

  const loadViaSupabaseFallback = React.useCallback(async (): Promise<SettingsPayload> => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) throw new Error("Not signed in");

    await ensureProfileRowClient(supabase, user);
    const profile = await fetchMyProfile(supabase);

    const firstSettings = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (firstSettings.error) throw firstSettings.error;
    let rawSettings = firstSettings.data;
    if (!rawSettings) {
      const { error: insErr } = await supabase.from("user_settings").insert({ user_id: user.id });
      if (insErr) throw insErr;
      const again = await supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle();
      if (again.error) throw again.error;
      rawSettings = again.data;
    }
    if (!rawSettings) throw new Error("Could not load user preferences");

    const settings = normalizeUserSettingsRow(user.id, rawSettings as Record<string, unknown>);
    return {
      email: user.email ?? null,
      profile: {
        id: profile?.id ?? user.id,
        name: profile?.name ?? null,
        created_at: profile?.created_at ?? null,
        first_name: profile?.first_name ?? null,
        middle_name: profile?.middle_name ?? null,
        last_name: profile?.last_name ?? null,
        display_name: profile?.display_name ?? null,
        role: String(profile?.role ?? "member"),
        phone: profile?.phone ?? null,
        phone_country_code: profile?.phone_country_code ?? null,
        timezone: profile?.timezone ?? null,
        location: profile?.location ?? null,
        avatar_url: profile?.avatar_url ?? null,
      },
      settings,
      connectedAccounts: [],
      teamMembers: [],
    };
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveNotice(null);
    try {
      const res = await fetch("/api/user/settings", { cache: "no-store", credentials: "include" });
      const j = (await res.json().catch(() => null)) as
        | (SettingsPayload & { error?: string; details?: string })
        | null;
      const okPayload =
        res.ok &&
        j &&
        typeof j === "object" &&
        j.profile &&
        j.settings &&
        typeof j.profile === "object" &&
        typeof j.settings === "object";

      if (okPayload) {
        applyPayloadToForm(j as SettingsPayload);
        syncUserStoreFromPayload(j as SettingsPayload);
        return;
      }

      const detail = j?.details ? ` ${j.details}` : "";
      const apiMsg =
        (j && typeof j.error === "string" && j.error) || `Could not load settings (HTTP ${res.status}).${detail}`;
      try {
        const p = await loadViaSupabaseFallback();
        applyPayloadToForm(p);
        syncUserStoreFromPayload(p);
        setError(null);
      } catch {
        throw new Error(apiMsg);
      }
    } catch (e) {
      try {
        const p = await loadViaSupabaseFallback();
        applyPayloadToForm(p);
        syncUserStoreFromPayload(p);
        setError(null);
      } catch {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      }
    } finally {
      setLoading(false);
    }
  }, [applyPayloadToForm, loadViaSupabaseFallback, syncUserStoreFromPayload]);

  /** Load settings; if returning from OAuth (?integrations=…), show result and strip query params. */
  React.useEffect(() => {
    if (!open) return;
    void (async () => {
      const readIntegrationParams = () => {
        const merged = new URLSearchParams(searchParams.toString());
        if (typeof window !== "undefined") {
          const w = new URLSearchParams(window.location.search);
          w.forEach((v, k) => {
            if (!merged.has(k)) merged.set(k, v);
          });
        }
        return {
          ig: merged.get("integrations")?.trim() ?? "",
          reason: merged.get("reason")?.trim() ?? "",
          detail: merged.get("detail")?.trim() ?? "",
        };
      };

      await load();

      let { ig, reason, detail } = readIntegrationParams();
      if (!ig && typeof window !== "undefined") {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        ({ ig, reason, detail } = readIntegrationParams());
      }
      if (!ig) return;

      const dedupe = `${ig}|${reason}|${detail}`;
      if (integrationReturnKeyRef.current === dedupe) return;
      integrationReturnKeyRef.current = dedupe;

      const isOk = ig === "microsoft_connected" || ig === "google_connected";
      try {
        posthog.capture("integration_oauth_return", {
          provider: ig.startsWith("microsoft") ? "microsoft" : "google",
          status: isOk ? "success" : "error",
          reason: reason || undefined,
          has_detail: Boolean(detail),
        });
      } catch {
        /* optional analytics */
      }

      if (isOk) {
        flashSaveNotice(ig.startsWith("microsoft") ? "Microsoft account connected." : "Google account connected.");
      } else if (ig === "microsoft_error" || ig === "google_error") {
        let msg = "Could not connect.";
        if (detail) {
          try {
            msg = decodeURIComponent(detail.replace(/\+/g, " "));
          } catch {
            msg = detail;
          }
        } else if (reason) {
          msg = `Error: ${reason}`;
        }
        setError(msg);
      }
      const path = typeof window !== "undefined" ? window.location.pathname : "/scratchpad";
      router.replace(path, { scroll: false });
    })();
  }, [open, load, searchParams, flashSaveNotice, router]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const patchSettings = (patch: Partial<UserSettingsRow>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
  };

  const saveProfileAndPrefs = async (successMessage = "Settings saved.") => {
    if (!settings) return;
    const em = email.trim();
    if (!em) {
      setError("Email is required");
      return;
    }
    setSaving(true);
    setError(null);
    setSaveNotice(null);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: em,
          profile: {
            first_name: firstName.trim() || null,
            middle_name: middleName.trim() || null,
            last_name: lastName.trim() || null,
            display_name: displayName.trim() || null,
            phone: phoneNational.replace(/\D/g, "") || null,
            phone_country_code: phoneNational.replace(/\D/g, "") ? phoneCountryCode : null,
            location: location.trim() || null,
            timezone: timezone.trim() || null,
            avatar_url: avatarUrl.trim() || null,
          },
          settings: {
            preferred_language: settings.preferred_language,
            assistant_tone: settings.assistant_tone,
            daily_briefing_style: settings.daily_briefing_style,
            voice_input_mode: settings.voice_input_mode,
            voice_input_language: settings.voice_input_language,
            voice_output_language: settings.voice_output_language,
            noise_suppression: settings.noise_suppression,
            auto_detect_speakers: settings.auto_detect_speakers,
            live_transcription: settings.live_transcription,
            voice_sensitivity: settings.voice_sensitivity,
            smart_reminders: settings.smart_reminders,
            followup_nudges: settings.followup_nudges,
            overdue_alerts: settings.overdue_alerts,
            daily_briefing_notification_time: settings.daily_briefing_notification_time,
            notification_sound: settings.notification_sound,
            event_reminders: settings.event_reminders,
            team_chat_settings: settings.team_chat_settings,
            billing_plan: settings.billing_plan,
            subscription_tier: settings.subscription_tier,
            billing_interval: settings.billing_interval,
            subscription_status: settings.subscription_status,
            current_period_end: settings.current_period_end,
            ask_bacup_addon: settings.ask_bacup_addon,
            clock_display_format: settings.clock_display_format,
          },
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        const base = typeof j?.error === "string" ? j.error : "Save failed";
        const det = typeof j?.details === "string" ? j.details : "";
        throw new Error(det ? `${base}: ${det}` : base);
      }
      const p = j as SettingsPayload;
      applyPayloadToForm(p);
      syncUserStoreFromPayload(p);
      {
        const { user, profile } = useUserStore.getState();
        syncPosthogPerson(user, profile);
      }
      flashSaveNotice(successMessage);
      router.refresh();
    } catch (e) {
      setSaveNotice(null);
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /** Clock-only PATCH avoids coupling to account email/profile (which can fail independently). */
  const saveClockPreferencesOnly = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaveNotice(null);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            clock_display_format: settings.clock_display_format,
          },
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        const base = typeof j?.error === "string" ? j.error : "Save failed";
        const det = typeof j?.details === "string" ? j.details : "";
        throw new Error(det ? `${base}: ${det}` : base);
      }
      const p = j as SettingsPayload;
      applyPayloadToForm(p);
      syncUserStoreFromPayload(p);
      flashSaveNotice("Preferences were saved.");
      router.refresh();
    } catch (e) {
      setSaveNotice(null);
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSaving(true);
    setError(null);
    setSaveNotice(null);
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Could not update password");
      setNewPassword("");
      setConfirmPassword("");
      flashSaveNotice("Your password was updated.");
    } catch (e) {
      setSaveNotice(null);
      setError(e instanceof Error ? e.message : "Could not update password");
    } finally {
      setSaving(false);
    }
  };

  const disconnectAccount = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/user/connected-accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Disconnect failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setSaving(false);
    }
  };

  const saveConnectedAccountDisplayName = async (id: string, value: string) => {
    setSaving(true);
    setError(null);
    try {
      const trimmed = value.trim();
      const res = await fetch("/api/user/connected-accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          display_name: trimmed === "" ? null : trimmed,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Save failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    onClose();
    await performAppSignOut(router);
  };

  if (!open) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: "account", label: "Account" },
    { id: "preferences", label: "Preferences" },
    { id: "security", label: "Security" },
    { id: "ai", label: "AI & Assistant" },
    { id: "voice", label: "Voice" },
    { id: "notifications", label: "Notifications" },
    { id: "integrations", label: "Integrations" },
    { id: "team", label: "Team" },
    { id: "billing", label: "Billing" },
  ];

  const connected = payload?.connectedAccounts ?? [];
  const googleAccounts = connected.filter((a: ConnectedAccountRow) => a.provider === "google");
  const imapAccounts = connected.filter((a: ConnectedAccountRow) => a.provider === "imap");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:p-4">
      <ImapConnectModal
        open={imapModalOpen}
        onClose={() => setImapModalOpen(false)}
        onConnected={async () => {
          await load();
        }}
      />
      <button type="button" aria-label="Close settings" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex h-[min(720px,calc(100dvh-1.5rem))] w-full max-w-[920px] overflow-hidden rounded-3xl border border-[#E0DDD6] bg-[#F5F3EF] shadow-[0_10px_28px_rgba(61,45,33,0.12)] dark:border-[hsl(35_10%_28%)] dark:bg-[hsl(35_12%_16%)] dark:shadow-[0_12px_28px_rgba(0,0,0,0.35)]"
      >
        <aside className="flex h-full min-h-0 w-[200px] shrink-0 flex-col border-r border-[#E0DDD6] bg-[#F5F3EF] p-3 dark:border-[hsl(35_10%_28%)] dark:bg-[hsl(35_14%_14%)]">
          <div className="mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Settings</div>
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  "rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors",
                  tab === t.id
                    ? "bg-[#6D665F] text-white dark:bg-[hsl(35_18%_28%)]"
                    : "text-[#6D665F] hover:bg-black/[0.04] dark:text-[hsl(35_18%_82%)] dark:hover:bg-white/[0.06]",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 shrink-0 rounded-lg border border-red-500/35 bg-red-500/[0.08] px-2.5 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-500/[0.12] dark:text-red-300"
          >
            Log out
          </button>
        </aside>

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F5F3EF] dark:bg-[hsl(35_12%_16%)]">
          <div className="flex shrink-0 items-center justify-between border-b border-[#E0DDD6] px-4 py-3 dark:border-[hsl(35_10%_28%)]">
            <div>
              <div className="text-sm font-semibold text-foreground">
                {tabs.find((x) => x.id === tab)?.label ?? "Settings"}
              </div>
              <div className="text-[11px] text-muted-foreground">User identity, preferences, and workspace</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#E0DDD6] bg-white/70 px-3 py-1 text-xs font-medium text-foreground hover:bg-white dark:border-[hsl(35_10%_28%)] dark:bg-black/25 dark:hover:bg-black/35"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {error ? (
              <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/[0.08] px-3 py-2 text-xs text-red-800 dark:text-red-200">
                <p>{error}</p>
                <button
                  type="button"
                  className="mt-2 text-[11px] font-medium underline underline-offset-2 hover:text-red-950 dark:hover:text-red-50"
                  onClick={() => void load()}
                >
                  Try again
                </button>
              </div>
            ) : saveNotice ? (
              <div
                role="status"
                aria-live="polite"
                className="mb-3 rounded-md border border-emerald-600/45 bg-emerald-500/[0.12] px-3 py-2 text-xs font-medium text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-500/[0.12] dark:text-emerald-100"
              >
                {saveNotice}
              </div>
            ) : null}

            {!error && (loading || !settings) ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : settings ? (
              tab === "account" ? (
              <div className="space-y-4">
                <Field label="Legal name">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      autoComplete="given-name"
                    />
                    <Input
                      value={middleName}
                      onChange={(e) => setMiddleName(e.target.value)}
                      placeholder="Middle name"
                      autoComplete="additional-name"
                    />
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      autoComplete="family-name"
                    />
                  </div>
                </Field>
                <Field label="Display name">
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="How you appear in Bacup"
                    autoComplete="nickname"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="Phone number">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <select
                      className="h-10 w-full shrink-0 rounded-md border border-foreground/10 bg-background px-2 text-sm sm:max-w-[min(100%,15rem)]"
                      value={phoneCountryCode}
                      onChange={(e) => setPhoneCountryCode(e.target.value)}
                      aria-label="Country calling code"
                    >
                      {!INTERNATIONAL_DIAL_CODES.some((x) => x.code === phoneCountryCode) ? (
                        <option value={phoneCountryCode}>{phoneCountryCode} (saved)</option>
                      ) : null}
                      {INTERNATIONAL_DIAL_CODES.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="min-w-0 flex-1"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={phoneNational}
                      onChange={(e) => setPhoneNational(e.target.value)}
                      placeholder="Phone number"
                    />
                  </div>
                </Field>
                <LocationTimezoneSection
                  modalOpen={open}
                  location={location}
                  timezone={timezone}
                  onLocationChange={setLocation}
                  onTimezoneChange={setTimezone}
                  timezoneSuggestions={COMMON_TIMEZONES}
                />
                <Field label="Profile photo">
                  <ProfileAvatarEditor avatarUrl={avatarUrl} onAvatarUrlChange={setAvatarUrl} />
                </Field>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveProfileAndPrefs("Your account details were saved.")}
                >
                  Save account
                </Button>
              </div>
            ) : tab === "preferences" ? (
              <div className="space-y-4">
                <p className="text-[13px] text-muted-foreground">Choose 12-hour or 24-hour for the top bar clock.</p>
                <Field label="Clock format">
                  <select
                    className="h-10 w-full max-w-md rounded-md border border-foreground/10 bg-background px-3 text-sm"
                    value={settings.clock_display_format}
                    onChange={(e) => {
                      const v = e.target.value === "24h" ? "24h" : "12h";
                      patchSettings({ clock_display_format: v });
                      useClockPreferencesStore.getState().setClockDisplayFormat(v);
                    }}
                  >
                    <option value="12h">12-hour (AM / PM)</option>
                    <option value="24h">24-hour</option>
                  </select>
                </Field>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveClockPreferencesOnly()}
                >
                  Save preferences
                </Button>
              </div>
            ) : tab === "security" ? (
              <div className="space-y-4">
                <p className="text-[13px] text-muted-foreground">
                  Choose a strong password you do not use on other sites.
                </p>
                <Field label="New password">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                    />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-border"
                  disabled={saving}
                  onClick={() => void changePassword()}
                >
                  Update password
                </Button>
              </div>
            ) : tab === "ai" ? (
              <div className="space-y-4">
                <Field label="Preferred language (voice + notes)">
                  <select
                    className="h-10 w-full max-w-md rounded-md border border-foreground/10 bg-background px-3 text-sm"
                    value={settings.preferred_language}
                    onChange={(e) => patchSettings({ preferred_language: e.target.value })}
                  >
                    {DEEPGRAM_LANGUAGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Assistant tone">
                  <select
                    className="h-10 w-full max-w-md rounded-md border border-foreground/10 bg-background px-3 text-sm"
                    value={settings.assistant_tone}
                    onChange={(e) =>
                      patchSettings({ assistant_tone: e.target.value as UserSettingsRow["assistant_tone"] })
                    }
                  >
                    <option value="direct">Direct</option>
                    <option value="balanced">Balanced</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </Field>
                <Field label="Daily briefing style">
                  <select
                    className="h-10 w-full max-w-md rounded-md border border-foreground/10 bg-background px-3 text-sm"
                    value={settings.daily_briefing_style}
                    onChange={(e) =>
                      patchSettings({ daily_briefing_style: e.target.value as UserSettingsRow["daily_briefing_style"] })
                    }
                  >
                    <option value="ultra_concise">Ultra concise</option>
                    <option value="standard">Standard</option>
                  </select>
                </Field>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveProfileAndPrefs("AI and assistant settings were saved.")}
                >
                  Save AI & assistant
                </Button>
              </div>
            ) : tab === "voice" ? (
              <div className="space-y-3">
                <Field label="Input language">
                  <select
                    className="h-10 w-full max-w-md rounded-md border border-foreground/10 bg-background px-3 text-sm"
                    value={settings.voice_input_mode}
                    onChange={(e) => patchSettings({ voice_input_mode: e.target.value as "auto" | "manual" })}
                  >
                    <option value="auto">Auto</option>
                    <option value="manual">Manual</option>
                  </select>
                </Field>
                {settings.voice_input_mode === "manual" ? (
                  <Field label="Manual input language">
                    <select
                      className="h-10 w-full max-w-md rounded-md border border-foreground/10 bg-background px-3 text-sm"
                      value={settings.voice_input_language ?? "en"}
                      onChange={(e) => patchSettings({ voice_input_language: e.target.value })}
                    >
                      {DEEPGRAM_LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Field label="Output language">
                  <select
                    className="h-10 w-full max-w-md rounded-md border border-foreground/10 bg-background px-3 text-sm"
                    value={settings.voice_output_language}
                    onChange={(e) => patchSettings({ voice_output_language: e.target.value })}
                  >
                    {DEEPGRAM_LANGUAGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <ToggleRow
                  label="Noise suppression"
                  checked={settings.noise_suppression}
                  onChange={(v) => patchSettings({ noise_suppression: v })}
                />
                <ToggleRow
                  label="Auto-detect speakers"
                  checked={settings.auto_detect_speakers}
                  onChange={(v) => patchSettings({ auto_detect_speakers: v })}
                />
                <ToggleRow
                  label="Live transcription"
                  checked={settings.live_transcription}
                  onChange={(v) => patchSettings({ live_transcription: v })}
                />
                <Field label="Voice sensitivity">
                  <select
                    className="h-10 w-full max-w-md rounded-md border border-foreground/10 bg-background px-3 text-sm"
                    value={settings.voice_sensitivity}
                    onChange={(e) =>
                      patchSettings({ voice_sensitivity: e.target.value as UserSettingsRow["voice_sensitivity"] })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveProfileAndPrefs("Voice settings were saved.")}
                >
                  Save voice settings
                </Button>
              </div>
            ) : tab === "notifications" ? (
              <div className="space-y-3">
                <ToggleRow
                  label="Smart reminders"
                  checked={settings.smart_reminders}
                  onChange={(v) => patchSettings({ smart_reminders: v })}
                />
                <ToggleRow
                  label="Follow-up nudges"
                  checked={settings.followup_nudges}
                  onChange={(v) => patchSettings({ followup_nudges: v })}
                />
                <ToggleRow
                  label="Overdue alerts"
                  checked={settings.overdue_alerts}
                  onChange={(v) => patchSettings({ overdue_alerts: v })}
                />
                <Field label="Daily briefing notification time">
                  <Input
                    type="time"
                    value={settings.daily_briefing_notification_time ?? "09:00"}
                    onChange={(e) => patchSettings({ daily_briefing_notification_time: e.target.value || null })}
                  />
                </Field>
                <Field label="Notification sound">
                  <div className="flex max-w-md flex-wrap items-center gap-2">
                    <select
                      className="h-10 min-w-0 flex-1 rounded-md border border-foreground/10 bg-background px-3 text-sm"
                      value={settings.notification_sound}
                      onChange={(e) => {
                        const id = coerceNotificationSoundId(e.target.value);
                        patchSettings({ notification_sound: id });
                        useNotificationSoundStore.getState().setSoundId(id);
                      }}
                    >
                      {NOTIFICATION_SOUND_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving || settings.notification_sound === "none"}
                      onClick={() => playNotificationSound(settings.notification_sound)}
                    >
                      Preview
                    </Button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Plays when new items appear in the header notification bell (visible tab only).
                  </p>
                </Field>
                <ToggleRow
                  label="Event reminders"
                  checked={settings.event_reminders}
                  onChange={(v) => patchSettings({ event_reminders: v })}
                />
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveProfileAndPrefs("Notification settings were saved.")}
                >
                  Save notifications
                </Button>
              </div>
            ) : tab === "integrations" ? (
              <div className="space-y-6">
                <div>
                  <div className="mb-2 text-sm font-semibold text-foreground">Google</div>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Sign in with Google to link Gmail and Calendar (read-only access for the first version). You can add
                    more than one Google account.
                  </p>
                  <div className="space-y-2">
                    {googleAccounts.map((a: ConnectedAccountRow) => (
                      <div
                        key={a.id}
                        className="rounded-md border border-[#E0DDD6] bg-white/60 px-3 py-2 text-xs dark:border-[hsl(35_10%_28%)] dark:bg-black/20"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{a.account_email}</div>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 text-red-600 hover:underline dark:text-red-400"
                            onClick={() => void disconnectAccount(a.id)}
                            disabled={saving}
                          >
                            Disconnect
                          </button>
                        </div>
                        <ConnectedAccountDisplayNameEditor
                          account={a}
                          disabled={saving}
                          onSave={saveConnectedAccountDisplayName}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <a
                      href="/api/integrations/google/start"
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
                    >
                      Connect with Google
                    </a>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-sm font-semibold text-foreground">Microsoft</div>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Microsoft 365 OAuth integration is coming soon. You will be able to sync Outlook mail and calendar
                    here.
                  </p>
                  <div className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-md border border-dashed border-[#E0DDD6] bg-white/40 px-3 text-sm font-medium text-muted-foreground dark:border-[hsl(35_10%_28%)] dark:bg-black/15">
                    Coming soon
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-foreground">Other email (IMAP)</div>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Connect any provider that supports IMAP (and optionally CalDAV for calendar). Credentials are
                    encrypted on the server.
                  </p>
                  <div className="space-y-2">
                    {imapAccounts.map((a: ConnectedAccountRow) => (
                      <div
                        key={a.id}
                        className="rounded-md border border-[#E0DDD6] bg-white/60 px-3 py-2 text-xs dark:border-[hsl(35_10%_28%)] dark:bg-black/20"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate font-medium text-foreground">{a.account_email}</span>
                          <button
                            type="button"
                            className="shrink-0 text-red-600 hover:underline dark:text-red-400"
                            onClick={() => void disconnectAccount(a.id)}
                            disabled={saving}
                          >
                            Disconnect
                          </button>
                        </div>
                        <ConnectedAccountDisplayNameEditor
                          account={a}
                          disabled={saving}
                          onSave={saveConnectedAccountDisplayName}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setImapModalOpen(true)}
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
                    >
                      Connect email
                    </button>
                  </div>
                </div>
              </div>
            ) : tab === "team" ? (
              <div className="space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  Every user owns their own login. Founders, EAs, and managers can be granted visibility over team tasks
                  from the workspace dashboard contract.
                </p>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Roles</div>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  <li>Founder — full workspace control</li>
                  <li>EA — executive assistant access</li>
                  <li>Managers — team management</li>
                  <li>Members — individual work</li>
                </ul>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Collaborators</div>
                {payload?.teamMembers?.length ? (
                  <div className="space-y-2">
                    {payload.teamMembers.map((m) => (
                      <div
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#E0DDD6] bg-white/60 px-3 py-2 text-xs dark:border-[hsl(35_10%_28%)] dark:bg-black/20"
                      >
                        <span className="font-medium text-foreground">{m.display_name || "Member"}</span>
                        <span className="text-muted-foreground">{m.member_user_id}</span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">{m.status}</span>
                        {m.can_view_dashboard_for_others ? (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400">dashboard share</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No collaborators yet.</div>
                )}
                <div className="rounded-md border border-dashed border-[#E0DDD6] bg-white/40 px-3 py-2 text-xs text-muted-foreground dark:border-[hsl(35_10%_28%)]">
                  Team chat settings — configure shared channels and notifications (coming soon).
                </div>
              </div>
            ) : (
              <BillingPage settings={settings} reloadSettings={load} flashSaveNotice={flashSaveNotice} />
            )
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
