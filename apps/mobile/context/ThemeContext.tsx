import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";
import { useColorScheme } from "react-native";

import { darkTheme, lightTheme, type AppTheme } from "@/lib/theme";

const STORAGE_KEY = "bacup:color-scheme";

type Scheme = "light" | "dark";

type ThemeCtx = {
  scheme: Scheme;
  theme: AppTheme;
  setScheme: (s: Scheme) => void;
};

const Ctx = React.createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = React.useState<Scheme | null>(null);

  React.useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark") setOverride(raw);
    })();
  }, []);

  const scheme: Scheme = override ?? (system === "dark" ? "dark" : "light");
  const theme = scheme === "dark" ? darkTheme : lightTheme;

  const setScheme = React.useCallback((s: Scheme) => {
    setOverride(s);
    void AsyncStorage.setItem(STORAGE_KEY, s);
  }, []);

  const value = React.useMemo(() => ({ scheme, theme, setScheme }), [scheme, setScheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppTheme() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAppTheme must be used within ThemeProvider");
  return v;
}
