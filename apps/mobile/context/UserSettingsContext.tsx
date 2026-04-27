import * as React from "react";

import { useAuth } from "@/context/AuthContext";
import { usePreferences } from "@/context/PreferencesContext";
import { getAppApiOrigin } from "@/lib/apiOrigin";
import { fetchMobileUserSettings, MobileHttpError, patchMobileUserSettings } from "@/lib/mobileSettingsApi";
import { loadSettingsPayloadFromSupabase } from "@/lib/loadSettingsPayloadFromSupabase";
import { patchSettingsViaSupabase } from "@/lib/patchSettingsViaSupabase";
import type { SettingsPayload } from "@/lib/settingsTypes";

type Ctx = {
  data: SettingsPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  patch: (body: Record<string, unknown>) => Promise<SettingsPayload>;
};

const UserSettingsCtx = React.createContext<Ctx | null>(null);

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const { syncFromUserSettings } = usePreferences();
  const [data, setData] = React.useState<SettingsPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const token = session?.access_token ?? null;
  const apiOrigin = getAppApiOrigin();

  function isNetworkishError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    const s = msg.toLowerCase();
    return (
      s.includes("network request failed") ||
      s.includes("failed to fetch") ||
      s.includes("load failed") ||
      s.includes("could not connect") ||
      s.includes("fetch failed")
    );
  }

  const refresh = React.useCallback(async () => {
    if (!token) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await fetchMobileUserSettings(token);
      setData(p);
      syncFromUserSettings(p.settings);
    } catch (e) {
      const is404 = e instanceof MobileHttpError && e.status === 404;
      const u = user ?? session?.user ?? null;
      if ((is404 || isNetworkishError(e)) && u) {
        const local = await loadSettingsPayloadFromSupabase(u);
        if (local) {
          setData(local);
          syncFromUserSettings(local.settings);
          // Keep the UI usable even when the Next.js API isn't reachable.
          // For iOS Simulator, "localhost" is expected to work; if it doesn't, it's usually because Next isn't running.
          setError(is404 ? null : `Network request failed (could not reach ${apiOrigin || "server"}).`);
          return;
        }
      }
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [token, user, session?.user, syncFromUserSettings, apiOrigin]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = React.useCallback(
    async (body: Record<string, unknown>) => {
      if (!token) throw new Error("Not signed in");
      const u = user ?? session?.user ?? null;
      try {
        const p = await patchMobileUserSettings(token, body);
        setData(p);
        syncFromUserSettings(p.settings);
        return p;
      } catch (e) {
        const is404 = e instanceof MobileHttpError && e.status === 404;
        if ((is404 || isNetworkishError(e)) && u) {
          const p = await patchSettingsViaSupabase(u, body);
          setData(p);
          syncFromUserSettings(p.settings);
          return p;
        }
        throw e;
      }
    },
    [token, user, session?.user, syncFromUserSettings],
  );

  const value = React.useMemo(
    () => ({ data, loading, error, refresh, patch }),
    [data, loading, error, refresh, patch],
  );

  return <UserSettingsCtx.Provider value={value}>{children}</UserSettingsCtx.Provider>;
}

export function useUserSettings() {
  const v = React.useContext(UserSettingsCtx);
  if (!v) throw new Error("useUserSettings must be used within UserSettingsProvider");
  return v;
}
