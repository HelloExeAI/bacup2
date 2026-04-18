"use client";

import * as React from "react";

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
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<FollowupRecipientSuggestion[]>([]);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const blurTimer = React.useRef<number | null>(null);

  const searchQ = recipientTypingToken(value);

  React.useEffect(() => {
    if (!open || disabled) return;
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `/api/followups/recipient-suggestions?q=${encodeURIComponent(searchQ)}&limit=14`,
            { credentials: "include", signal: ac.signal },
          );
          const j = (await res.json().catch(() => null)) as { suggestions?: FollowupRecipientSuggestion[] } | null;
          if (!ac.signal.aborted) {
            setItems(Array.isArray(j?.suggestions) ? j.suggestions : []);
          }
        } catch {
          if (!ac.signal.aborted) setItems([]);
        } finally {
          if (!ac.signal.aborted) setLoading(false);
        }
      })();
    }, 180);
    return () => {
      ac.abort();
      window.clearTimeout(t);
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
  };

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const showList = open && (loading || items.length > 0);

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showList}
        onFocus={() => {
          clearBlurTimer();
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 160);
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {showList ? (
        <div
          className="absolute z-[80] mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-left text-sm shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          {loading && items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
          ) : null}
          {items.map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted/80"
              onClick={() => onPick(row)}
            >
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {row.email} · {row.subtitle}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
