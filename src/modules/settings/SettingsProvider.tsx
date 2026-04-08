"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { coerceNotificationSoundId } from "@/lib/notifications/notificationSounds";
import { SettingsModal, type SettingsTabId } from "@/modules/settings/SettingsModal";
import { useClockPreferencesStore } from "@/store/clockPreferencesStore";
import { useNotificationSoundStore } from "@/store/notificationSoundStore";
import { useUserStore } from "@/store/userStore";

type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  openSettings: () => void;
  openSettingsToTab: (tab: SettingsTabId) => void;
};

const SettingsModalContext = React.createContext<Ctx | null>(null);

/**
 * OAuth callbacks append ?integrations=… to the URL. The settings modal must open even if the user
 * lands on /scratchpad (modal was closed); otherwise integration handling never runs and errors look “silent”.
 */
function OpenIntegrationsTabOnOAuthReturn() {
  const searchParams = useSearchParams();
  const ctx = React.useContext(SettingsModalContext);
  const openedForKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!ctx) return;
    const fromUrl =
      searchParams.get("integrations")?.trim() ||
      (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("integrations")?.trim() : "") ||
      "";
    if (!fromUrl) {
      openedForKeyRef.current = null;
      return;
    }
    if (!fromUrl.startsWith("microsoft_") && !fromUrl.startsWith("google_")) return;
    const detail = searchParams.get("detail") || new URLSearchParams(window.location.search).get("detail") || "";
    const key = `${fromUrl}|${detail}`;
    if (openedForKeyRef.current === key) return;
    openedForKeyRef.current = key;
    ctx.openSettingsToTab("integrations");
  }, [ctx, searchParams]);

  return null;
}

function ClientSettingsHydrator() {
  const userId = useUserStore((s) => s.user?.id ?? null);

  React.useEffect(() => {
    if (!userId) {
      useNotificationSoundStore.getState().setSoundId("none");
      useClockPreferencesStore.getState().hydrateFromSettings({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/user/settings", { cache: "no-store", credentials: "include" });
        const j = (await res.json().catch(() => null)) as { settings?: Record<string, unknown> } | null;
        if (cancelled || !res.ok || !j?.settings) return;
        const s = j.settings;
        useNotificationSoundStore.getState().setSoundId(coerceNotificationSoundId(s.notification_sound));
        useClockPreferencesStore.getState().hydrateFromSettings(s);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [initialTab, setInitialTab] = React.useState<SettingsTabId | null>(null);

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      openSettings: () => {
        setInitialTab(null);
        setOpen(true);
      },
      openSettingsToTab: (tab: SettingsTabId) => {
        setInitialTab(tab);
        setOpen(true);
      },
    }),
    [open],
  );

  return (
    <SettingsModalContext.Provider value={value}>
      <ClientSettingsHydrator />
      <OpenIntegrationsTabOnOAuthReturn />
      {children}
      <SettingsModal
        open={open}
        initialTab={initialTab}
        onClose={() => {
          setOpen(false);
          setInitialTab(null);
        }}
      />
    </SettingsModalContext.Provider>
  );
}

export function useSettingsModal() {
  const ctx = React.useContext(SettingsModalContext);
  if (!ctx) {
    throw new Error("useSettingsModal must be used within SettingsProvider");
  }
  return ctx;
}
