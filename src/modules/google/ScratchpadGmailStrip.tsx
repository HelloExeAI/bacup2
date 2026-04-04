"use client";

import * as React from "react";

import type { ConnectedAccountRow } from "@/modules/settings/types";
import { useSettingsModal } from "@/modules/settings/SettingsProvider";
import { useScratchpadStore } from "@/store/scratchpadStore";

type GmailRow = {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  error?: boolean;
};

type MailFolder = "inbox" | "sent";

function folderLabel(f: MailFolder): string {
  if (f === "sent") return "Sent";
  return "Inbox";
}

/** Strip-level shell (includes top margin). */
const MAIL_STRIP_SHELL =
  "mt-4 rounded-xl bacup-surface p-3 shadow-[0_1px_0_rgba(70,54,39,0.04),0_8px_20px_rgba(61,45,33,0.08)] dark:shadow-[0_12px_24px_rgba(0,0,0,0.28)]";

/** Per-account card (no top margin; parent provides `space-y`). */
const MAIL_ACCOUNT_CARD_SHELL =
  "rounded-xl bacup-surface p-3 shadow-[0_1px_0_rgba(70,54,39,0.04),0_8px_20px_rgba(61,45,33,0.08)] dark:shadow-[0_12px_24px_rgba(0,0,0,0.28)]";

const ICON_S = 12;

function IconButton({
  label,
  onClick,
  pressed,
  disabled,
  ariaExpanded,
  ariaControls,
  title: titleAttr,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={titleAttr ?? label}
      aria-pressed={pressed}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-foreground/75 shadow-sm transition-colors",
        "hover:bg-foreground/5 hover:text-foreground",
        pressed ? "border-foreground/25 bg-foreground/8 text-foreground" : "",
        disabled ? "pointer-events-none opacity-40" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width={ICON_S} height={ICON_S} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M16 16 21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={ICON_S} height={ICON_S} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width={ICON_S}
      height={ICON_S}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Inbox tray — folder menu trigger (no text label). */
function MailFolderTrayIcon() {
  return (
    <svg width={ICON_S} height={ICON_S} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 8l5-5h8l5 5v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 8h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ScratchpadGmailAccountPanel({
  accountId,
  accountEmail,
  displayName,
}: {
  accountId: string;
  accountEmail: string;
  displayName?: string | null;
}) {
  const openGmailThread = useScratchpadStore((s) => s.openGmailThread);
  const openGmailCompose = useScratchpadStore((s) => s.openGmailCompose);
  const selectedDate = useScratchpadStore((s) => s.selectedDate);
  const [mailDate, setMailDate] = React.useState(selectedDate);
  const [folder, setFolder] = React.useState<MailFolder>("inbox");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [listExpanded, setListExpanded] = React.useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = React.useState(false);
  const folderMenuRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** `null` = first fetch not finished yet (no visible loading). */
  const [messages, setMessages] = React.useState<GmailRow[] | null>(null);
  const listId = React.useId();

  React.useEffect(() => {
    setMailDate(selectedDate);
  }, [selectedDate]);

  React.useEffect(() => {
    if (!folderMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (folderMenuRef.current?.contains(e.target as Node)) return;
      setFolderMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [folderMenuOpen]);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams({
        maxResults: "25",
        accountId,
        date: mailDate,
        folder,
      });
      const res = await fetch(`/api/integrations/google/gmail?${q}`, { credentials: "include" });
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 404) {
        setError("Account not connected.");
        setMessages([]);
        return;
      }
      if (!res.ok) {
        setError(typeof j?.message === "string" ? j.message : "Could not load mail.");
        setMessages([]);
        return;
      }
      const list = Array.isArray(j?.messages) ? (j.messages as GmailRow[]) : [];
      setMessages(list);
    } catch {
      setError("Could not load mail.");
      setMessages([]);
    }
  }, [accountId, mailDate, folder]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  React.useEffect(() => {
    if (!listExpanded) return;
    const onDown = (e: MouseEvent) => {
      const el = panelRef.current;
      if (!el?.contains(e.target as Node)) {
        setListExpanded(false);
        setFolderMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [listExpanded]);

  const titleText = displayName?.trim() ? displayName.trim() : accountEmail;

  const openInboxForScratchpadDay = () => {
    setFolder("inbox");
    setMailDate(selectedDate);
    setListExpanded(true);
  };

  const pickFolder = (next: MailFolder) => {
    setFolder(next);
    setFolderMenuOpen(false);
    setListExpanded(true);
  };

  const emptyDayHint =
    folder === "sent" ? "No sent messages for this day." : "No messages in Inbox for this day.";

  return (
    <section ref={panelRef} className={MAIL_ACCOUNT_CARD_SHELL} aria-label={`Mail ${titleText}`}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={openInboxForScratchpadDay}
          aria-expanded={listExpanded}
          aria-controls={listId}
          className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring/50"
          title="Open Inbox for this day and show messages"
        >
          <h2 className="truncate text-xs font-semibold tracking-tight text-foreground" title={accountEmail}>
            {titleText}
          </h2>
          {displayName?.trim() ? (
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={accountEmail}>
              {accountEmail}
            </p>
          ) : null}
        </button>
        <div className="flex items-center gap-1">
          <IconButton
            label={searchOpen ? "Close date search" : "Search mail by date"}
            pressed={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <SearchIcon />
          </IconButton>
          <IconButton
            label="Compose new email"
            title="Compose new email"
            onClick={() =>
              openGmailCompose({
                accountId,
                accountEmail,
                displayName: displayName ?? null,
              })
            }
          >
            <PlusIcon />
          </IconButton>
          <div className="relative" ref={folderMenuRef}>
            <button
              type="button"
              aria-label={`Choose mail folder (current: ${folderLabel(folder)})`}
              aria-expanded={folderMenuOpen}
              aria-haspopup="listbox"
              title={`Mail folder — ${folderLabel(folder)}. Inbox or Sent.`}
              onClick={() => setFolderMenuOpen((v) => !v)}
              className={[
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-foreground/85 shadow-sm transition-colors",
                "hover:bg-foreground/5 hover:text-foreground",
                folderMenuOpen ? "border-foreground/25 bg-foreground/8 text-foreground" : "",
                listExpanded && !folderMenuOpen ? "border-foreground/20 bg-foreground/[0.06]" : "",
              ].join(" ")}
            >
              <MailFolderTrayIcon />
            </button>
            {folderMenuOpen ? (
              <ul
                role="listbox"
                aria-label="Mail folder"
                className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[7.5rem] rounded-lg border border-border/80 bg-background py-1 shadow-lg"
              >
                {(
                  [
                    ["inbox", "Inbox"],
                    ["sent", "Sent"],
                  ] as const
                ).map(([value, label]) => (
                  <li key={value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={folder === value}
                      className={[
                        "flex w-full px-3 py-1.5 text-left text-[11px] text-foreground",
                        folder === value ? "bg-foreground/8 font-medium" : "hover:bg-foreground/5",
                      ].join(" ")}
                      onClick={() => pickFolder(value)}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      {searchOpen ? (
        <div className="mt-3 rounded-lg border border-border/50 bg-background/50 px-2.5 py-2">
          <label htmlFor={`${listId}-date`} className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Message date
          </label>
          <input
            id={`${listId}-date`}
            type="date"
            value={mailDate}
            onChange={(e) => setMailDate(e.target.value)}
            className="h-9 w-full max-w-[11rem] rounded-md border border-border/70 bg-background px-2 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-[11px] text-red-600/90 dark:text-red-400">{error}</p>
      ) : listExpanded ? (
        <ul
          id={listId}
          role="list"
          aria-label={`Messages for ${accountEmail}`}
          className="mt-3 max-h-[min(50vh,320px)] space-y-2 overflow-y-auto pr-0.5"
        >
          {messages === null ? null : messages.length === 0 ? (
            <li className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-3 text-center text-[11px] text-muted-foreground">
              {emptyDayHint}
            </li>
          ) : (
            messages.map((m) => (
              <li key={m.id}>
                {m.error ? (
                  <div className="rounded-lg border border-border/50 bg-background/55 px-2.5 py-2 shadow-[0_1px_0_rgba(70,54,39,0.03)]">
                    <span className="text-[11px] text-muted-foreground">Could not load message.</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      openGmailThread({
                        accountId,
                        accountEmail,
                        displayName: displayName ?? null,
                        messageId: m.id,
                        threadId: m.threadId,
                        subject: m.subject,
                        from: m.from,
                        date: m.date,
                        snippet: m.snippet,
                      })
                    }
                    className="w-full rounded-lg border border-border/50 bg-background/55 px-2.5 py-2 text-left shadow-[0_1px_0_rgba(70,54,39,0.03)] transition-colors hover:bg-foreground/[0.04] focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <p className="line-clamp-2 text-xs font-medium text-foreground">{m.subject}</p>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{m.from}</p>
                    {m.snippet ? (
                      <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground/90">{m.snippet}</p>
                    ) : null}
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </section>
  );
}

export function ScratchpadGmailStrip() {
  const { openSettingsToTab } = useSettingsModal();
  const [googleAccounts, setGoogleAccounts] = React.useState<
    Pick<ConnectedAccountRow, "id" | "account_email" | "display_name">[]
  >([]);
  /** After first fetch completes; refetches do not hide the strip. */
  const [accountsReady, setAccountsReady] = React.useState(false);

  const loadGoogleAccounts = React.useCallback(async () => {
    try {
      const res = await fetch("/api/user/connected-accounts", { credentials: "include" });
      const j = (await res.json().catch(() => null)) as { accounts?: ConnectedAccountRow[] } | null;
      if (!res.ok || !j?.accounts) {
        setGoogleAccounts([]);
        return;
      }
      const google = j.accounts
        .filter((a) => a.provider === "google")
        .map((a) => ({
          id: a.id,
          account_email: a.account_email,
          display_name: a.display_name ?? null,
        }));
      setGoogleAccounts(google);
    } catch {
      setGoogleAccounts([]);
    } finally {
      setAccountsReady(true);
    }
  }, []);

  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("integrations") === "google_connected") {
      const u = new URL(window.location.href);
      u.searchParams.delete("integrations");
      window.history.replaceState({}, "", `${u.pathname}${u.search}`);
    }

    void loadGoogleAccounts();

    const onFocus = () => void loadGoogleAccounts();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadGoogleAccounts]);

  if (!accountsReady) {
    return null;
  }

  if (googleAccounts.length === 0) {
    return (
      <section className={MAIL_STRIP_SHELL} aria-label="Mail">
        <div className="mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Mail</h2>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          No Google accounts connected — open{" "}
          <button
            type="button"
            onClick={() => openSettingsToTab("integrations")}
            className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
          >
            Settings → Integrations
          </button>{" "}
          to connect one or more Google accounts, then return here. Use{" "}
          <button
            type="button"
            onClick={() => void loadGoogleAccounts()}
            className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
          >
            refresh
          </button>{" "}
          if you just connected.
        </p>
      </section>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {googleAccounts.map((acc) => (
        <ScratchpadGmailAccountPanel
          key={acc.id}
          accountId={acc.id}
          accountEmail={acc.account_email}
          displayName={acc.display_name}
        />
      ))}
    </div>
  );
}
