"use client";

import * as React from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/** Never infer from OS or stray DOM classes — only explicit app choice in localStorage. */
function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  try {
    const stored = localStorage.getItem("bacup-theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // ignore
  }
  return "light";
}

function syncColorSchemeMeta(t: Theme) {
  if (typeof document === "undefined") return;
  const m = document.querySelector('meta[name="color-scheme"]');
  if (m) {
    m.setAttribute("content", t === "dark" ? "dark" : "light");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR + first paint: light; after mount, apply saved app theme only (never OS).
  const [theme, setThemeState] = React.useState<Theme>("light");

  React.useLayoutEffect(() => {
    const t = readInitialTheme();
    setThemeState(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    syncColorSchemeMeta(t);
  }, []);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("bacup-theme", t);
    } catch {
      // ignore
    }
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", t === "dark");
      syncColorSchemeMeta(t);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

