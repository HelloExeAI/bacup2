"use client";

import * as React from "react";

import { splitLastRecipient } from "@/lib/integrations/google/splitRecipientField";

const inputClass =
  "h-10 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

type ContactRow = { email: string; displayName: string | null };

function formatPick(c: ContactRow): string {
  if (c.displayName?.trim()) {
    const safe = c.displayName.replace(/[<>]/g, "").trim();
    return `${safe} <${c.email}>`;
  }
  return c.email;
}

function mergeValueAfterPick(fullValue: string, picked: string): string {
  const { before } = splitLastRecipient(fullValue);
  return `${before}${picked}`;
}

export function GmailRecipientInput({
  accountId,
  value,
  onChange,
  label,
  id,
  placeholder,
  disabled,
}: {
  accountId: string;
  value: string;
  onChange: (next: string) => void;
  label: string;
  id: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [contacts, setContacts] = React.useState<ContactRow[]>([]);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = React.useRef(0);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runSearch = React.useCallback(
    (q: string) => {
      const idNum = ++reqIdRef.current;
      void (async () => {
        setErrorMsg(null);
        setLoading(true);
        setOpen(true);
        try {
          const res = await fetch(
            `/api/integrations/google/contacts/search?${new URLSearchParams({ accountId, q })}`,
            { credentials: "include" },
          );
          const j = (await res.json().catch(() => null)) as
            | { contacts?: ContactRow[]; hint?: string; message?: string; error?: string }
            | null;
          if (reqIdRef.current !== idNum) return;
          if (!res.ok) {
            const msg =
              typeof j?.hint === "string" && j.hint.trim()
                ? j.hint.trim()
                : typeof j?.message === "string" && j.message.trim()
                  ? j.message.trim()
                  : typeof j?.error === "string" && j.error.trim()
                    ? j.error.trim()
                    : `Search failed (${res.status})`;
            setErrorMsg(msg);
            setContacts([]);
            setActive(0);
            setOpen(true);
            return;
          }
          setContacts(Array.isArray(j?.contacts) ? j!.contacts! : []);
          setActive(0);
          setOpen(true);
        } catch {
          if (reqIdRef.current !== idNum) return;
          setContacts([]);
          setErrorMsg("Search failed. Check your connection and try again.");
          setOpen(true);
        } finally {
          if (reqIdRef.current === idNum) setLoading(false);
        }
      })();
    },
    [accountId],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    onChange(next);
    const { current } = splitLastRecipient(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (current.length < 3) {
      reqIdRef.current += 1; // invalidate any in-flight response
      setContacts([]);
      setErrorMsg(null);
      setLoading(false);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(current.trim()), 280);
  };

  const pick = (c: ContactRow) => {
    const fragment = formatPick(c);
    onChange(mergeValueAfterPick(value, fragment));
    setOpen(false);
    setContacts([]);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || contacts.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(contacts.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const c = contacts[active];
      if (c) pick(c);
    }
  };

  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div ref={wrapRef} className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          onFocus={() => {
            const { current } = splitLastRecipient(value);
            if (current.trim().length >= 3) setOpen(contacts.length > 0);
          }}
          className={inputClass}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
        />
        {open && (contacts.length > 0 || loading || !!errorMsg) ? (
          <ul
            id={`${id}-listbox`}
            role="listbox"
            className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border/80 bg-popover py-1 text-sm shadow-lg"
          >
            {loading && contacts.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>
            ) : null}
            {!loading && errorMsg ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">{errorMsg}</li>
            ) : null}
            {contacts.map((c, i) => (
              <li key={`${c.email}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={[
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-foreground/5",
                    i === active ? "bg-foreground/8" : "",
                  ].join(" ")}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    pick(c);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="font-medium text-foreground">{c.displayName || c.email}</span>
                  {c.displayName ? <span className="text-[11px] text-muted-foreground">{c.email}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </label>
  );
}
