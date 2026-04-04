"use client";

import * as React from "react";

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
