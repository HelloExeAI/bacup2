"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppNotificationBell } from "@/components/notifications/AppNotificationBell";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAskBacupStore } from "@/store/askBacupStore";
import { TopbarFlipClock } from "@/components/clock/TopbarFlipClock";
import { TopbarTimer } from "@/components/clock/TopbarTimer";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { useSettingsModal } from "@/modules/settings/SettingsProvider";
import { useClockPreferencesStore } from "@/store/clockPreferencesStore";
import { useUserStore } from "@/store/userStore";
import { useMeetingRecorderStore } from "@/store/meetingRecorderStore";

/** Heroicons outline `cog-6-tooth` — standard 6-tooth gear */
const COG_6_OUTER =
  "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.723 6.723 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 0 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.281Z";
function SettingsIcon3D() {
  const uid = React.useId().replace(/:/g, "");
  const gid = `bacup-sg-grad-${uid}`;
  return (
    <span className="bacup-settings-gear-scene" aria-hidden>
      <span className="bacup-settings-gear-3d inline-flex text-foreground/88">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="overflow-visible">
          <defs>
            <linearGradient id={gid} x1="3" y1="5" x2="21" y2="19" gradientUnits="userSpaceOnUse">
              <stop offset="0%" className="[stop-color:hsl(35_12%_52%)] dark:[stop-color:hsl(215_16%_78%)]" />
              <stop offset="100%" className="[stop-color:hsl(35_10%_32%)] dark:[stop-color:hsl(220_12%_52%)]" />
            </linearGradient>
          </defs>
          <g transform="translate(0.35 0.35)" opacity={0.2} aria-hidden>
            <path
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              d={COG_6_OUTER}
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.5} fill="none" />
          </g>
          <path
            stroke={`url(#${gid})`}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            d={COG_6_OUTER}
          />
          <circle cx="12" cy="12" r="3" stroke={`url(#${gid})`} strokeWidth={1.5} fill="none" />
        </svg>
      </span>
    </span>
  );
}

function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  if (href === "/workspace" || href === "/my-view") return pathname === href;
  return pathname === href;
}

function TopbarNavMenuButton() {
  const pathname = usePathname();
  const { canUseBusinessOs, ready } = useSubscriptionTier();
  const navLinks = React.useMemo(() => {
    const tail = [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/calendar", label: "Calendar" },
      { href: "/scratchpad", label: "Scratchpad" },
    ];
    if (!ready) {
      return [{ href: "/my-view", label: "My View" }, ...tail];
    }
    if (canUseBusinessOs) {
      return [{ href: "/workspace", label: "Overview" }, ...tail];
    }
    return [{ href: "/my-view", label: "My View" }, ...tail];
  }, [ready, canUseBusinessOs]);
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        title="Navigation menu"
        onClick={() => setOpen((v) => !v)}
        className="group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-transparent text-foreground transition-[transform,background-color] hover:bg-muted/60 active:scale-[0.97]"
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <span className="flex h-[18px] w-[22px] flex-col items-center justify-center" aria-hidden>
          <span
            className={[
              "block h-0.5 w-[22px] origin-center rounded-full bg-current transition-transform duration-200 ease-out",
              open ? "translate-y-[7px] rotate-45" : "",
            ].join(" ")}
          />
          <span
            className={[
              "my-[5px] block h-0.5 w-[22px] rounded-full bg-current transition-opacity duration-200 ease-out",
              open ? "opacity-0" : "opacity-100",
            ].join(" ")}
          />
          <span
            className={[
              "block h-0.5 w-[22px] origin-center rounded-full bg-current transition-transform duration-200 ease-out",
              open ? "-translate-y-[7px] -rotate-45" : "",
            ].join(" ")}
          />
        </span>
      </button>

      <div
        id={menuId}
        role="menu"
        aria-hidden={!open}
        className={[
          "absolute right-0 top-full z-[60] mt-2 min-w-[15rem] overflow-hidden rounded-xl border border-border/80 bg-background/98 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)] backdrop-blur-md dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
          "origin-top-right transition-[transform,opacity,visibility] duration-200 ease-out",
          open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <div className="border-b border-border/50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Go to</p>
        </div>
        <ul className="p-1">
          {navLinks.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <li key={item.href} role="none">
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={[
                    "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-foreground/10 text-foreground"
                      : "text-foreground/85 hover:bg-muted/80 hover:text-foreground",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function AskBacupMicButton() {
  const setOpen = useAskBacupStore((s) => s.setOpen);
  return (
    <button
      type="button"
      aria-label="Open Ask Bacup"
      title="Ask Bacup"
      onClick={() => setOpen(true)}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-transparent text-foreground transition-[transform,colors] hover:bg-muted/60 active:scale-[0.97]"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-foreground/90" aria-hidden>
        <path
          d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function MeetingRecorderButton() {
  const open = useMeetingRecorderStore((s) => s.open);
  return (
    <button
      type="button"
      aria-label="Meeting recorder"
      title="Meeting recorder"
      onClick={() => open()}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-transparent text-foreground transition-[transform,colors] hover:bg-muted/60 active:scale-[0.97]"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-foreground/90" aria-hidden>
        <path
          d="M9 7a3 3 0 0 1 6 0v6a3 3 0 1 1-6 0V7Z"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M7 11v1a5 5 0 0 0 10 0v-1"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path d="M12 18v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function Topbar() {
  const pathname = usePathname();
  const isDashboard =
    pathname === "/dashboard" || (pathname != null && pathname.startsWith("/dashboard/"));
  const { openSettings } = useSettingsModal();
  const profile = useUserStore((s) => s.profile);
  const user = useUserStore((s) => s.user);
  const clockDisplayFormat = useClockPreferencesStore((s) => s.clockDisplayFormat);
  const [avatarBroken, setAvatarBroken] = React.useState(false);

  React.useEffect(() => {
    setAvatarBroken(false);
  }, [profile?.avatar_url]);

  const avatarSrc = profile?.avatar_url?.trim() || "";
  const initial = (
    profile?.display_name?.trim()?.[0] ||
    profile?.name?.trim()?.[0] ||
    user?.email?.[0] ||
    "?"
  ).toUpperCase();

  /** Horizontally align with main column (same axis as centered scratchpad date): sidebar w-60, right panel w-64 @ xl. */
  const clockAnchorClass = isDashboard
    ? "left-1/2 -translate-x-1/2"
    : "left-[calc(15rem+(100vw-15rem)/2)] -translate-x-1/2 xl:left-[calc(15rem+(100vw-15rem-16rem)/2)]";

  return (
    <header className="relative z-40 h-16 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="relative flex h-full w-full min-w-0 items-center justify-between gap-4 px-4 sm:px-5 lg:px-6">
        <div className="relative z-10 flex min-w-0 shrink-0 items-center gap-3">
          <Link href="/start" className="flex min-w-0 items-center gap-2.5" title="Home">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold">
              Bc
            </div>
            <div className="text-[15px] font-semibold tracking-wide">Bacup</div>
          </Link>
        </div>

        {user ? (
          <div
            className={[
              "pointer-events-none absolute inset-y-0 z-0 hidden items-center justify-center md:flex",
              clockAnchorClass,
            ].join(" ")}
          >
            <div className="pointer-events-auto flex items-center gap-1.5">
              <TopbarFlipClock profileTimezone={profile?.timezone} clockDisplayFormat={clockDisplayFormat} />
              <TopbarTimer />
            </div>
          </div>
        ) : null}

        <div className="relative z-10 flex min-w-0 shrink-0 items-center justify-end gap-2 sm:gap-3">
          {user ? <TopbarNavMenuButton /> : null}
          {user ? <AskBacupMicButton /> : null}
          {user ? <MeetingRecorderButton /> : null}
          <ThemeToggle iconOnly variant="topbar" />
          <AppNotificationBell size="topbar" />
          <button
            type="button"
            aria-label="Settings"
            onClick={() => openSettings()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-md bg-transparent text-foreground transition-[transform,colors] hover:bg-muted/60 active:scale-[0.97]"
          >
            <SettingsIcon3D />
          </button>
          <div
            className="flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted"
            aria-label="User avatar"
            role="img"
          >
            {avatarSrc && !avatarBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-foreground/80">
                {initial}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

