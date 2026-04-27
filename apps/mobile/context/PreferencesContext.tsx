import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";

import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase";

export type DateFormat = "ymd" | "dmy" | "mdy" | "dmy_yy" | "dmy_mon_yy";
export type TimeFormat = "24h" | "12h";

type Prefs = {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  setDateFormat: (v: DateFormat) => void;
  setTimeFormat: (v: TimeFormat) => void;
  /** Align local chips + storage with `user_settings` after a web/mobile settings API save. */
  syncFromUserSettings: (row: { date_display_format?: unknown; clock_display_format?: unknown }) => void;
};

const STORAGE_DATE = "bacup:pref:date-format";
const STORAGE_TIME = "bacup:pref:time-format";

const Ctx = React.createContext<Prefs | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [dateFormat, setDateFormatState] = React.useState<DateFormat>("ymd");
  const [timeFormat, setTimeFormatState] = React.useState<TimeFormat>("24h");
  const { user } = useAuth();
  const userId = user?.id ?? null;

  React.useEffect(() => {
    void (async () => {
      const d = await AsyncStorage.getItem(STORAGE_DATE);
      const t = await AsyncStorage.getItem(STORAGE_TIME);
      if (d === "ymd" || d === "dmy" || d === "mdy" || d === "dmy_yy" || d === "dmy_mon_yy") setDateFormatState(d);
      if (t === "24h" || t === "12h") setTimeFormatState(t);
    })();
  }, []);

  // Pull from Supabase so the preference applies across web + mobile.
  React.useEffect(() => {
    if (!userId) return;
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await sb
        .from("user_settings")
        .select("date_display_format,clock_display_format")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) return;
      const d = String((data as any)?.date_display_format ?? "").trim();
      const c = String((data as any)?.clock_display_format ?? "").trim();
      if (d === "ymd" || d === "dmy" || d === "mdy" || d === "dmy_yy" || d === "dmy_mon_yy") setDateFormatState(d);
      if (c === "12h" || c === "24h") setTimeFormatState(c === "24h" ? "24h" : "12h");
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setDateFormat = React.useCallback((v: DateFormat) => {
    setDateFormatState(v);
    void AsyncStorage.setItem(STORAGE_DATE, v);
    const sb = getSupabase();
    if (sb && userId) {
      void sb.from("user_settings").upsert({ user_id: userId, date_display_format: v }, { onConflict: "user_id" });
    }
  }, [userId]);

  const setTimeFormat = React.useCallback((v: TimeFormat) => {
    setTimeFormatState(v);
    void AsyncStorage.setItem(STORAGE_TIME, v);
    const sb = getSupabase();
    if (sb && userId) {
      void sb
        .from("user_settings")
        .upsert({ user_id: userId, clock_display_format: v }, { onConflict: "user_id" });
    }
  }, [userId]);

  const syncFromUserSettings = React.useCallback((row: { date_display_format?: unknown; clock_display_format?: unknown }) => {
    const d = String(row.date_display_format ?? "").trim();
    const c = String(row.clock_display_format ?? "").trim();
    if (d === "ymd" || d === "dmy" || d === "mdy" || d === "dmy_yy" || d === "dmy_mon_yy") {
      setDateFormatState(d);
      void AsyncStorage.setItem(STORAGE_DATE, d);
    }
    if (c === "12h" || c === "24h") {
      const tf: TimeFormat = c === "24h" ? "24h" : "12h";
      setTimeFormatState(tf);
      void AsyncStorage.setItem(STORAGE_TIME, tf);
    }
  }, []);

  const value = React.useMemo(
    () => ({ dateFormat, timeFormat, setDateFormat, setTimeFormat, syncFromUserSettings }),
    [dateFormat, timeFormat, setDateFormat, setTimeFormat, syncFromUserSettings],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("usePreferences must be used within PreferencesProvider");
  return v;
}

