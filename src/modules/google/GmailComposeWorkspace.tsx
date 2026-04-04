"use client";

import * as React from "react";

import { GmailEmailRedraftPanel, IconRedraft, plainEmailBody } from "@/modules/google/GmailEmailRedraftPanel";
import { GmailQuillEditor } from "@/modules/google/GmailQuillEditor";
import { GMAIL_QUILL_FONT_OPTIONS } from "@/modules/google/gmailQuillFonts";
import { GMAIL_QUILL_SIZE_PX_OPTIONS } from "@/modules/google/gmailQuillSizes";

const SIG_KEY = "bacup_mail_signature_html";

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let j = 0; j < bytes.length; j += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(j, j + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

const iconBtn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80 text-foreground/85 shadow-sm transition-colors hover:bg-foreground/8 hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconAttach() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconSignature() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20h16M6 16l6-12 6 12M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const fieldChipBtn =
  "rounded-md border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-foreground/[0.04]";

/**
 * Full-screen new message compose (scratchpad +), same shell as reply/forward compose.
 */
export function GmailComposeWorkspace({
  accountId,
  accountEmail,
  displayName,
  onClose,
}: {
  accountId: string;
  accountEmail: string;
  displayName: string | null;
  onClose: () => void;
}) {
  const composeWrapRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [to, setTo] = React.useState("");
  const [cc, setCc] = React.useState("");
  const [bcc, setBcc] = React.useState("");
  const [showCc, setShowCc] = React.useState(false);
  const [showBcc, setShowBcc] = React.useState(false);
  const [subj, setSubj] = React.useState("");
  const [editorHtml, setEditorHtml] = React.useState("");
  const [lineHeight, setLineHeight] = React.useState("1");
  const [sending, setSending] = React.useState(false);
  const [sendErr, setSendErr] = React.useState<string | null>(null);
  const [attachments, setAttachments] = React.useState<{ filename: string; contentType: string; dataBase64: string }[]>([]);

  const [redraftOpen, setRedraftOpen] = React.useState(false);

  const quillModules = React.useMemo(
    () => ({
      toolbar: {
        container: [
          [{ font: GMAIL_QUILL_FONT_OPTIONS }, { size: GMAIL_QUILL_SIZE_PX_OPTIONS }],
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ script: "sub" }, { script: "super" }],
          [{ header: [1, 2, 3, false] }],
          [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
          [{ align: [] }],
          ["blockquote", "code-block"],
          ["link", "image"],
          ["clean"],
        ],
      },
    }),
    [],
  );

  React.useEffect(() => {
    const root = composeWrapRef.current;
    if (!root) return;
    const ed = root.querySelector(".ql-editor");
    if (ed instanceof HTMLElement) ed.style.lineHeight = lineHeight;
  }, [lineHeight, editorHtml]);

  React.useEffect(() => {
    function defaultBody(): string {
      try {
        const sig = localStorage.getItem(SIG_KEY);
        if (sig?.trim()) return `<p><br/></p><p><br/></p>${sig}`;
      } catch {
        /* ignore */
      }
      return "<p><br/></p>";
    }
    setEditorHtml(defaultBody());
  }, []);

  React.useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (redraftOpen) {
        setRedraftOpen(false);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", fn, true);
    return () => document.removeEventListener("keydown", fn, true);
  }, [onClose, redraftOpen]);

  const insertSignature = () => {
    const ta = window.prompt("Paste signature HTML (saved locally as default)", localStorage.getItem(SIG_KEY) ?? "");
    if (ta === null) return;
    try {
      localStorage.setItem(SIG_KEY, ta);
    } catch {
      /* ignore */
    }
    setEditorHtml((prev) => `${prev}<br/>${ta}`);
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const next = [...attachments];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const buf = await f.arrayBuffer();
      next.push({
        filename: f.name,
        contentType: f.type || "application/octet-stream",
        dataBase64: arrayBufferToBase64(buf),
      });
    }
    setAttachments(next);
    e.target.value = "";
  };

  const removeCcField = () => {
    setShowCc(false);
    setCc("");
  };

  const removeBccField = () => {
    setShowBcc(false);
    setBcc("");
  };

  const openRedraftPanel = () => {
    if (!plainEmailBody(editorHtml)) {
      setSendErr("Add some text to the email body before redrafting.");
      return;
    }
    setRedraftOpen(true);
  };

  const send = async () => {
    const plain = editorHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!plain.length) {
      setSendErr("Write a message first.");
      return;
    }
    if (!to.trim()) {
      setSendErr("Add a recipient in To.");
      return;
    }
    setSending(true);
    setSendErr(null);
    try {
      const res = await fetch("/api/integrations/google/gmail/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          mode: "new",
          to: to.trim(),
          cc: showCc && cc.trim() ? cc.trim() : undefined,
          bcc: showBcc && bcc.trim() ? bcc.trim() : undefined,
          subject: subj.trim(),
          htmlBody: editorHtml,
          attachments: attachments.length ? attachments : undefined,
        }),
      });
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const hint = typeof j?.hint === "string" ? j.hint : "";
        const msg =
          typeof j?.message === "string"
            ? j.message
            : typeof j?.error === "string"
              ? j.error
              : "Send failed.";
        setSendErr(hint ? `${msg} ${hint}` : msg);
        return;
      }
      onClose();
    } catch {
      setSendErr("Send failed.");
    } finally {
      setSending(false);
    }
  };

  const title = displayName?.trim() ? displayName.trim() : accountEmail;

  return (
    <div
      className="fixed inset-0 z-[65] flex flex-col bg-background print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gmail-compose-email-title"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <button type="button" onClick={onClose} className={iconBtn} aria-label="Close" title="Close">
          <IconBack />
        </button>
        <h2 id="gmail-compose-email-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          Compose Email
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={sending}
            onClick={() => void send()}
            className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            className="rounded-lg border border-border/80 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        <span className="hidden min-w-0 max-w-[10rem] shrink-0 truncate text-[11px] text-muted-foreground lg:inline" title={accountEmail}>
          {title}
        </span>
      </header>

      {sendErr ? (
        <p className="shrink-0 border-b border-border/60 bg-red-500/5 px-3 py-2 text-xs text-red-600/90 dark:text-red-400">{sendErr}</p>
      ) : null}

      <div className="shrink-0 space-y-2 border-b border-border/60 p-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">To</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            placeholder="recipient@example.com"
          />
        </label>

        {(!showCc || !showBcc) && (
          <div className="flex flex-wrap items-center gap-2">
            {!showCc ? (
              <button type="button" className={fieldChipBtn} onClick={() => setShowCc(true)}>
                Cc
              </button>
            ) : null}
            {!showBcc ? (
              <button type="button" className={fieldChipBtn} onClick={() => setShowBcc(true)}>
                Bcc
              </button>
            ) : null}
          </div>
        )}

        {showCc ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Cc</span>
              <button
                type="button"
                className="rounded p-0.5 text-[11px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                aria-label="Remove Cc field"
                onClick={removeCcField}
              >
                Remove
              </button>
            </div>
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="h-10 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder="Optional"
            />
          </div>
        ) : null}

        {showBcc ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Bcc</span>
              <button
                type="button"
                className="rounded p-0.5 text-[11px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                aria-label="Remove Bcc field"
                onClick={removeBccField}
              >
                Remove
              </button>
            </div>
            <input
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              className="h-10 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder="Optional"
            />
          </div>
        ) : null}

        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">Subject</span>
          <input
            value={subj}
            onChange={(e) => setSubj(e.target.value)}
            className="h-10 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            placeholder="Subject"
          />
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-3 pt-2">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Line spacing
            <select
              value={lineHeight}
              onChange={(e) => setLineHeight(e.target.value)}
              className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs"
            >
              <option value="1">1</option>
              <option value="1.15">1.15</option>
              <option value="1.5">1.5</option>
              <option value="2">2</option>
            </select>
          </label>
          <button type="button" className={iconBtn} title="Signature" aria-label="Save or insert signature" onClick={insertSignature}>
            <IconSignature />
          </button>
          <button type="button" className={iconBtn} title="Attach files" aria-label="Attach files" onClick={() => fileRef.current?.click()}>
            <IconAttach />
          </button>
          <button
            type="button"
            onClick={openRedraftPanel}
            className={[
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-background/70 px-2.5 text-[11px] font-medium text-foreground/90 shadow-sm transition-colors hover:bg-foreground/[0.04]",
              redraftOpen ? "border-foreground/25 bg-foreground/[0.06]" : "",
            ].join(" ")}
            title="AI redraft"
            aria-expanded={redraftOpen}
            aria-controls="gmail-compose-redraft-panel"
          >
            <IconRedraft />
            Redraft
          </button>
          <input ref={fileRef} type="file" className="hidden" multiple onChange={(e) => void onPickFiles(e)} />
        </div>

        <GmailEmailRedraftPanel
          open={redraftOpen}
          onClose={() => setRedraftOpen(false)}
          initialHtml={editorHtml}
          onApply={(html) => setEditorHtml(html)}
          panelId="gmail-compose-redraft-panel"
        />

        <div
          ref={composeWrapRef}
          className="gmail-quill-fullscreen flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/50 bg-background"
        >
          <GmailQuillEditor
            value={editorHtml}
            onChange={setEditorHtml}
            modules={quillModules}
            className="flex h-full min-h-0 flex-1 flex-col [&_.ql-toolbar]:shrink-0 [&_.ql-container]:min-h-0 [&_.ql-container]:flex-1 [&_.ql-container]:border-0 [&_.ql-editor]:min-h-[min(50dvh,520px)] [&_.ql-editor]:overflow-y-auto"
          />
        </div>

        {attachments.length > 0 ? (
          <ul className="shrink-0 text-xs text-muted-foreground">
            {attachments.map((a) => (
              <li key={a.filename}>{a.filename}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
