"use client";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/ThemeProvider";

function IconMoon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className="shrink-0"
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSun({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

const iconOnlyCompactClass =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const iconOnlyTopbarClass =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-md bg-transparent text-foreground transition-[transform,colors] hover:bg-muted/60 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function ThemeToggle({
  className = "",
  iconOnly = false,
  variant = "compact",
}: {
  className?: string;
  /** Hide “Light/Dark” label — icon only (cockpit or topbar). */
  iconOnly?: boolean;
  /** `topbar`: matches bell/settings size; `compact`: smaller cockpit control. */
  variant?: "compact" | "topbar";
}) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  if (iconOnly) {
    const base = variant === "topbar" ? iconOnlyTopbarClass : iconOnlyCompactClass;
    const iconSize = variant === "topbar" ? 20 : 16;
    return (
      <button
        type="button"
        className={[base, className].filter(Boolean).join(" ")}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Light mode" : "Dark mode"}
      >
        {isDark ? (
          <span className="bacup-theme-toggle-sun text-foreground">
            <IconSun size={iconSize} />
          </span>
        ) : (
          <span className="bacup-theme-toggle-moon text-foreground">
            <IconMoon size={iconSize} />
          </span>
        )}
      </button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      type="button"
    >
      {isDark ? "Light" : "Dark"}
    </Button>
  );
}
