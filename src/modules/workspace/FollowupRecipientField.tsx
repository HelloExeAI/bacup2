"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import type { FollowupRecipientSuggestion } from "@/lib/followups/recipientSuggestionTypes";

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function parseTokens(raw: string): string[] {
  return raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Text after the last comma or newline (what the user is currently typing for the next address). */
function recipientTypingToken(raw: string): string {
  const lastComma = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("\n"));
  const tail = lastComma < 0 ? raw : raw.slice(lastComma + 1);
  return tail.trim();
}

function applyRecipientPick(raw: string, email: string): string {
  const em = normalizeEmail(email);
  if (!em) return raw;
  const existing = parseTokens(raw).map(normalizeEmail);
  if (existing.includes(em)) return raw;

  const token = recipientTypingToken(raw);
  const lastDelim = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("\n"));

  if (token === "") {
    if (lastDelim >= 0) {
      return `${raw.slice(0, lastDelim + 1)} ${email}`.replace(/\s+/g, " ").trim();
    }
    return email;
  }

  if (!token.includes("@")) {
    if (lastDelim >= 0) {
      return `${raw.slice(0, lastDelim + 1)} ${email}`.replace(/\s+/g, " ").trim();
    }
    return email;
  }

  const base = raw.trimEnd();
  return base ? `${base}, ${email}` : email;
}

type Props = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function FollowupRecipientField({ id, value, onChange, disabled, placeholder }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const blurTimer = React.useRef<number | null>(null);

  const [open, setOpen] = React.useState(false);
  const [debouncing, setDebouncing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [items, setItems] = React.useState<FollowupRecipientSuggestion[]>([]);
  const [panelPos, setPanelPos] = React.useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const searchQ = recipientTypingToken(value);

  const showPanel =
    open &&
    !disabled &&
    (debouncing || loading || items.length > 0 || (hasSearched && !debouncing && !loading));

  const updatePanelPos = React.useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - r.bottom - gap - 8;
    const maxHeight = Math.min(240, Math.max(120, spaceBelow));
    setPanelPos({
      top: r.bottom + gap,
      left: r.left,
      width: r.width,
      maxHeight,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!showPanel) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
  }, [showPanel, updatePanelPos, value]);

  React.useEffect(() => {
    if (!showPanel) return;
    const onScrollOrResize = () => updatePanelPos();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [showPanel, updatePanelPos]);

  React.useEffect(() => {
    if (!open || disabled) {
      setDebouncing(false);
      setLoading(false);
      setHasSearched(false);
      setItems([]);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();

    setDebouncing(true);
    setHasSearched(false);

    const t = window.setTimeout(() => {
      if (cancelled) return;
      setDebouncing(false);
      setLoading(true);
      setItems([]);
      void (async () => {
        try {
          const res = await fetch(
            `/api/followups/recipient-suggestions?q=${encodeURIComponent(searchQ)}&limit=14`,
            { credentials: "include", signal: ac.signal },
          );
          const j = (await res.json().catch(() => null)) as { suggestions?: FollowupRecipientSuggestion[] } | null;
          if (cancelled) return;
          setItems(Array.isArray(j?.suggestions) ? j.suggestions : []);
        } catch {
          if (!cancelled && !ac.signal.aborted) setItems([]);
        } finally {
          if (!cancelled) {
            setLoading(false);
            setHasSearched(true);
          }
        }
      })();
    }, 180);

    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(t);
      setDebouncing(false);
      setLoading(false);
    };
  }, [open, disabled, searchQ]);

  const clearBlurTimer = () => {
    if (blurTimer.current != null) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const onPick = (row: FollowupRecipientSuggestion) => {
    clearBlurTimer();
    onChange(applyRecipientPick(value, row.email));
    setOpen(false);
    setHasSearched(false);
    setItems([]);
  };

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node;
      if (inputRef.current?.contains(node) || panelRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const portal =
    typeof document !== "undefined" &&
    showPanel &&
    panelPos &&
    createPortal(
      <div
        ref={panelRef}
        role="listbox"
        className="fixed z-[200] overflow-auto rounded-lg border border-border bg-background py-1 text-left text-sm shadow-xl ring-1 ring-black/5 dark:ring-white/10"
        style={{
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
          maxHeight: panelPos.maxHeight,
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {debouncing || (loading && items.length === 0) ? (
          <div className="px-3 py-2.5 text-xs text-muted-foreground">Searching…</div>
        ) : null}
        {!debouncing && !loading && items.length === 0 && hasSearched ? (
          <div className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            No saved suggestions yet. Add team members, assign tasks to emails, or send a follow-up once to build this
            list.
          </div>
        ) : null}
        {items.map((row) => (
          <button
            key={row.id}
            type="button"
            role="option"
            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
            onClick={() => onPick(row)}
          >
            <span className="font-medium text-foreground">{row.label}</span>
            <span className="text-[11px] text-muted-foreground">
              {row.email} · {row.subtitle}
            </span>
          </button>
        ))}
      </div>,
      document.body,
    );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        onFocus={() => {
          clearBlurTimer();
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => {
            setOpen(false);
            setHasSearched(false);
            setItems([]);
          }, 200);
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setHasSearched(false);
            setItems([]);
          }
        }}
      />
      {portal}
    </div>
  );
}
