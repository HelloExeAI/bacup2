"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onClose: () => void;
  onConnected: () => void | Promise<void>;
};

export function ImapConnectModal({ open, onClose, onConnected }: Props) {
  const [email, setEmail] = React.useState("");
  const [imapHost, setImapHost] = React.useState("");
  const [imapPort, setImapPort] = React.useState("993");
  const [imapSecure, setImapSecure] = React.useState(true);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [caldavUrl, setCaldavUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/imap/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          imapHost: imapHost.trim(),
          imapPort: Number(imapPort) || 993,
          imapSecure,
          username: username.trim() || undefined,
          password,
          caldavUrl: caldavUrl.trim() || "",
        }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) {
        const msg =
          typeof j?.message === "string"
            ? j.message
            : typeof j?.error === "string"
              ? j.error
              : "Could not connect.";
        throw new Error(msg);
      }
      setPassword("");
      await onConnected();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-2xl border border-[#E0DDD6] bg-[#F5F3EF] p-4 shadow-xl dark:border-[hsl(35_10%_28%)] dark:bg-[hsl(35_12%_16%)]"
      >
        <h2 className="text-sm font-semibold text-foreground">Connect email (IMAP)</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          For providers other than Google or Microsoft. Password is encrypted on the server. Optionally add a CalDAV URL
          to merge calendar events (same password is used when supported).
        </p>

        <div className="mt-4 space-y-3">
          <Field label="Email address">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="IMAP host">
            <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.example.com" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Port">
              <Input value={imapPort} onChange={(e) => setImapPort(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="TLS">
              <label className="flex h-10 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={imapSecure}
                  onChange={(e) => setImapSecure(e.target.checked)}
                  className="rounded border-border"
                />
                Use TLS (SSL)
              </label>
            </Field>
          </div>
          <Field label="Username (optional)">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Defaults to email"
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="CalDAV URL (optional)">
            <Input
              value={caldavUrl}
              onChange={(e) => setCaldavUrl(e.target.value)}
              placeholder="https://caldav.example.com/"
            />
          </Field>
        </div>

        {error ? (
          <p className="mt-3 text-[11px] text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !email.trim() || !imapHost.trim() || !password}
            onClick={() => void submit()}
          >
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
