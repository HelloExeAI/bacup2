"use client";

import * as React from "react";
import DOMPurify from "dompurify";

import { GmailEmailRedraftPanel, IconRedraft, plainEmailBody } from "@/modules/google/GmailEmailRedraftPanel";
import { GmailRecipientInput } from "@/modules/google/GmailRecipientInput";
import { GmailQuillEditor } from "@/modules/google/GmailQuillEditor";
import { VoiceInput } from "@/modules/scratchpad/VoiceInput";
import { GMAIL_QUILL_FONT_OPTIONS } from "@/modules/google/gmailQuillFonts";
import { GMAIL_QUILL_SIZE_PX_OPTIONS } from "@/modules/google/gmailQuillSizes";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMyTasks } from "@/lib/supabase/queries";
import { ymdToday } from "@/modules/tasks/dayBriefing";
import type { ScratchpadGmailThreadOpen } from "@/store/scratchpadStore";
import { useTaskStore } from "@/store/taskStore";

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

type MessageDetail = {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  textBody: string;
  htmlBody: string;
  snippet: string;
  mailboxEmail: string;
  replyAll: { to: string; cc: string };
};

function sanitizeEmailHtml(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["style", "img", "table", "thead", "tbody", "tr", "td", "th", "colgroup", "col", "center"],
    ADD_ATTR: [
      "style",
      "class",
      "cellpadding",
      "cellspacing",
      "border",
      "align",
      "valign",
      "colspan",
      "rowspan",
      "width",
      "height",
      "src",
      "href",
      "target",
      "rel",
      "id",
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data|cid):|\/api\/)/i,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isQuillEmptyBody(html: string): boolean {
  const t = (html || "").replace(/\s/g, "");
  return !t || t === "<p><br></p>" || t === "<p></p>";
}

function transcriptToQuillHtml(text: string): string {
  const escaped = escapeHtml(text);
  return `<p>${escaped.replace(/\n/g, "<br/>")}</p>`;
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
function IconReply() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 14L4 9l5-5M4 9h11a5 5 0 015 5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconReplyAll() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 10H4.5L8 6.5M4.5 10H8l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 14h-4.5L18 17.5M14.5 14H18l-2.5-2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 4v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}
function IconForward() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 14l5-5-5-5M20 9H9a5 5 0 00-5 5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v6l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconPrint() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 17H5a2 2 0 01-2-2v-4h18v4a2 2 0 01-2 2h-2M7 11V5h10v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 21h10v-6H7v6z" stroke="currentColor" strokeWidth="2" />
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

export function GmailThreadWorkspace({
  thread,
  onClose,
}: {
  thread: ScratchpadGmailThreadOpen;
  onClose: () => void;
}) {
  const printRef = React.useRef<HTMLDListElement>(null);
  const composeWrapRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<MessageDetail | null>(null);
  const [safeHtml, setSafeHtml] = React.useState("");

  const [composeMode, setComposeMode] = React.useState<"reply" | "reply_all" | "forward" | null>(null);
  const [to, setTo] = React.useState("");
  const [cc, setCc] = React.useState("");
  const [subj, setSubj] = React.useState("");
  const [editorHtml, setEditorHtml] = React.useState("");
  const voiceBaseHtmlRef = React.useRef<string>("");
  const [lineHeight, setLineHeight] = React.useState("1");
  const [sending, setSending] = React.useState(false);
  const [sendErr, setSendErr] = React.useState<string | null>(null);
  const [attachments, setAttachments] = React.useState<{ filename: string; contentType: string; dataBase64: string }[]>([]);

  const [followupErr, setFollowupErr] = React.useState<string | null>(null);
  const [followupSaving, setFollowupSaving] = React.useState(false);
  const [redraftOpen, setRedraftOpen] = React.useState(false);
  const setTasks = useTaskStore((s) => s.setTasks);

  const refreshTasks = React.useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const next = await fetchMyTasks(supabase);
    setTasks(next);
  }, [setTasks]);

  const resolveGmailThreadId = React.useCallback(() => {
    return detail?.threadId ?? thread.threadId ?? null;
  }, [detail?.threadId, thread.threadId]);

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
  }, [lineHeight, composeMode, editorHtml]);

  React.useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (redraftOpen) {
        setRedraftOpen(false);
        return;
      }
      if (composeMode) {
        setComposeMode(null);
        setEditorHtml("");
        setTo("");
        setCc("");
        setAttachments([]);
        setSendErr(null);
        setRedraftOpen(false);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", fn, true);
    return () => document.removeEventListener("keydown", fn, true);
  }, [composeMode, onClose, redraftOpen]);

  React.useEffect(() => {
    let cancelled = false;
    setFollowupErr(null);
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({
      messageId: thread.messageId,
      accountId: thread.accountId,
    });
    void (async () => {
      try {
        const res = await fetch(`/api/integrations/google/gmail/message?${q}`, { credentials: "include" });
        const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (cancelled) return;
        if (!res.ok) {
          setErr(typeof j?.message === "string" ? j.message : "Could not load message.");
          setDetail(null);
          return;
        }
        const ra = j?.replyAll as { to?: string; cc?: string } | undefined;
        const d: MessageDetail = {
          id: typeof j?.id === "string" ? j.id : thread.messageId,
          threadId: typeof j?.threadId === "string" ? j.threadId : thread.threadId,
          subject: typeof j?.subject === "string" ? j.subject : thread.subject,
          from: typeof j?.from === "string" ? j.from : thread.from,
          to: typeof j?.to === "string" ? j.to : "",
          cc: typeof j?.cc === "string" ? j.cc : "",
          date: typeof j?.date === "string" ? j.date : thread.date,
          textBody: typeof j?.textBody === "string" ? j.textBody : "",
          htmlBody: typeof j?.htmlBody === "string" ? j.htmlBody : "",
          snippet: typeof j?.snippet === "string" ? j.snippet : thread.snippet,
          mailboxEmail: typeof j?.mailboxEmail === "string" ? j.mailboxEmail : thread.accountEmail,
          replyAll: {
            to: typeof ra?.to === "string" ? ra.to : "",
            cc: typeof ra?.cc === "string" ? ra.cc : "",
          },
        };
        setDetail(d);
        const rawHtml = d.htmlBody?.trim()
          ? d.htmlBody
          : `<p>${(d.textBody || d.snippet || "").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`;
        setSafeHtml(sanitizeEmailHtml(rawHtml));
      } catch {
        if (!cancelled) setErr("Could not load message.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thread.accountId, thread.messageId, thread.date, thread.from, thread.snippet, thread.subject, thread.threadId, thread.accountEmail]);

  const startReply = () => {
    if (!detail) return;
    setComposeMode("reply");
    const target =
      detail.replyAll.to ||
      (() => {
        const m = detail.from.match(/<([^>]+@[^>]+)>/);
        if (m) return m[1].trim();
        const m2 = detail.from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        return m2 ? m2[1] : "";
      })();
    setTo(target);
    setCc("");
    setSubj(/^re:\s*/i.test(detail.subject) ? detail.subject : `Re: ${detail.subject}`);
    setEditorHtml(defaultComposeBody());
    setAttachments([]);
    setSendErr(null);
  };

  const startReplyAll = () => {
    if (!detail) return;
    setComposeMode("reply_all");
    setTo(detail.replyAll.to);
    setCc(detail.replyAll.cc);
    setSubj(/^re:\s*/i.test(detail.subject) ? detail.subject : `Re: ${detail.subject}`);
    setEditorHtml(defaultComposeBody());
    setAttachments([]);
    setSendErr(null);
  };

  const startForward = () => {
    if (!detail) return;
    setComposeMode("forward");
    setTo("");
    setCc("");
    setSubj(/^fwd:\s*/i.test(detail.subject) ? detail.subject : `Fwd: ${detail.subject}`);
    setEditorHtml(defaultComposeBody());
    setAttachments([]);
    setSendErr(null);
  };

  function defaultComposeBody(): string {
    try {
      const sig = localStorage.getItem(SIG_KEY);
      if (sig?.trim()) return `<p><br/></p><p><br/></p>${sig}`;
    } catch {
      /* ignore */
    }
    return "<p><br/></p>";
  }

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

  const addReplyLaterTodo = async () => {
    const subjectLine = detail?.subject?.trim() || subj.trim() || thread.subject;
    if (!subjectLine) return;
    setFollowupErr(null);
    setFollowupSaving(true);
    try {
      const res = await fetch("/api/integrations/google/gmail/followup-task", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: thread.accountId,
          gmailMessageId: thread.messageId,
          gmailThreadId: resolveGmailThreadId(),
          kind: "reply_later",
          subject: subjectLine,
          dueDate: ymdToday(),
        }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) {
        setFollowupErr(
          typeof j?.message === "string"
            ? j.message
            : typeof j?.error === "string"
              ? j.error
              : "Could not add to today's tasks.",
        );
        return;
      }
      await refreshTasks();
    } finally {
      setFollowupSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
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

  const cancelCompose = () => {
    setComposeMode(null);
    setEditorHtml("");
    setTo("");
    setCc("");
    setAttachments([]);
    setSendErr(null);
    setRedraftOpen(false);
  };

  const openRedraftPanel = () => {
    if (!plainEmailBody(editorHtml)) {
      setSendErr("Add some text to the email body before redrafting.");
      return;
    }
    setRedraftOpen(true);
  };

  const send = async () => {
    if (!composeMode) return;
    const plain = editorHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!plain.length) {
      setSendErr("Write a message first.");
      return;
    }
    if (composeMode === "forward" && !to.trim()) {
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
          accountId: thread.accountId,
          mode: composeMode,
          originalMessageId: thread.messageId,
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject: subj.trim(),
          htmlBody: editorHtml,
          attachments: attachments.length ? attachments : undefined,
        }),
      });
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.ok && typeof j?.id === "string") {
        const { queueGmailProcessAfterSend } = await import("@/lib/google/gmailProcessClient");
        const tr =
          composeMode === "forward"
            ? "forward"
            : composeMode === "reply_all"
              ? "reply_all"
              : "reply";
        queueGmailProcessAfterSend(thread.accountId, j.id, tr);
      }
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
      await refreshTasks();
      cancelCompose();
    } catch {
      setSendErr("Send failed.");
    } finally {
      setSending(false);
    }
  };

  const title = detail?.subject ?? thread.subject;

  return (
    <>
      <section
        className="flex h-full min-h-0 w-full max-h-full flex-col overflow-hidden rounded-xl border border-border bg-background/85 shadow-[0_1px_0_rgba(70,54,39,0.04),0_8px_20px_rgba(61,45,33,0.08)] dark:shadow-[0_12px_24px_rgba(0,0,0,0.28)] print:h-auto print:max-h-none print:overflow-visible print:shadow-none print:border-0"
        aria-label="Mail message"
      >
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2.5 print:border-0">
          <button type="button" onClick={onClose} className={iconBtn} aria-label="Back" title="Back">
            <IconBack />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground print:text-black" title={title}>
            {title}
          </h1>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-2 py-2 print:hidden">
          <button type="button" className={iconBtn} title="Reply" aria-label="Reply" onClick={startReply} disabled={!detail}>
            <IconReply />
          </button>
          <button type="button" className={iconBtn} title="Reply all" aria-label="Reply all" onClick={startReplyAll} disabled={!detail}>
            <IconReplyAll />
          </button>
          <button type="button" className={iconBtn} title="Forward" aria-label="Forward" onClick={startForward} disabled={!detail}>
            <IconForward />
          </button>
          <button
            type="button"
            className={iconBtn}
            title="Add reply to today's tasks"
            aria-label="Reply later: add to today's tasks"
            onClick={() => void addReplyLaterTodo()}
            disabled={!detail || followupSaving}
          >
            <IconClock />
          </button>
          <button type="button" className={iconBtn} title="Print" aria-label="Print" onClick={handlePrint} disabled={!detail}>
            <IconPrint />
          </button>
        </div>

        {followupErr ? (
          <p className="shrink-0 border-b border-border/40 px-3 py-1.5 text-[11px] text-red-600/90 dark:text-red-400 print:hidden">{followupErr}</p>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 print:overflow-visible print:p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading message…</p>
          ) : err ? (
            <p className="text-sm text-red-600/90 dark:text-red-400">{err}</p>
          ) : detail ? (
            <>
              <dl ref={printRef} className="email-print-root shrink-0 space-y-2 border-b border-border/40 pb-3 text-sm print:border-0">
                <div className="grid gap-1 sm:grid-cols-[4rem_1fr] sm:items-start">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From</dt>
                  <dd className="break-all text-foreground/95">{detail.from || "—"}</dd>
                </div>
                <div className="grid gap-1 sm:grid-cols-[4rem_1fr] sm:items-start">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To</dt>
                  <dd className="break-all text-foreground/95">{detail.to?.trim() ? detail.to : "—"}</dd>
                </div>
                <div className="grid gap-1 sm:grid-cols-[4rem_1fr] sm:items-start">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cc</dt>
                  <dd className="break-all text-foreground/95">{detail.cc?.trim() ? detail.cc : "—"}</dd>
                </div>
                {detail.date ? (
                  <div className="grid gap-1 sm:grid-cols-[4rem_1fr] sm:items-start">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</dt>
                    <dd className="text-[11px] uppercase tracking-wide text-muted-foreground/90">{detail.date}</dd>
                  </div>
                ) : null}
              </dl>

              <div
                className="email-body-html min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border/35 bg-muted/20 p-3 text-sm leading-[1.5] print:overflow-visible print:border-0 print:bg-white"
                style={{ lineHeight: 1.5 }}
              >
                <div className="prose-email max-w-none [&_img]:max-w-full [&_img]:h-auto [&_a]:text-blue-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: safeHtml }} />
              </div>
            </>
          ) : null}
        </div>
      </section>

      {composeMode ? (
        <div
          className="fixed inset-0 z-[65] flex flex-col bg-background print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gmail-compose-title"
        >
          <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
            <button type="button" onClick={cancelCompose} className={iconBtn} aria-label="Close compose" title="Close">
              <IconBack />
            </button>
            <h2 id="gmail-compose-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {composeMode === "reply" ? "Reply" : composeMode === "reply_all" ? "Reply all" : "Forward"}
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
                onClick={cancelCompose}
                className="rounded-lg border border-border/80 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </header>

          {sendErr ? (
            <p className="shrink-0 border-b border-border/60 bg-red-500/5 px-3 py-2 text-xs text-red-600/90 dark:text-red-400">{sendErr}</p>
          ) : null}

          <div className="shrink-0 space-y-2 border-b border-border/60 p-3">
            <GmailRecipientInput
              accountId={thread.accountId}
              id="gmail-thread-compose-to"
              label="To"
              value={to}
              onChange={setTo}
              placeholder="Name or email"
              disabled={sending}
            />
            <GmailRecipientInput
              accountId={thread.accountId}
              id="gmail-thread-compose-cc"
              label="Cc"
              value={cc}
              onChange={setCc}
              placeholder="Optional"
              disabled={sending}
            />
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Subject</span>
              <input
                value={subj}
                onChange={(e) => setSubj(e.target.value)}
                className="h-10 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
              <VoiceInput
                compact
                showCompactListeningLabel
                saveTranscriptToTasks={false}
                onListeningChange={(isListening) => {
                  if (!isListening) return;
                  voiceBaseHtmlRef.current = isQuillEmptyBody(editorHtml) ? "" : editorHtml;
                }}
                onTranscriptChange={(fullText) => {
                  const transcriptText = fullText.trim();
                  const transcriptHtml = transcriptToQuillHtml(fullText);
                  const base = voiceBaseHtmlRef.current.trim();
                  if (!transcriptText) {
                    setEditorHtml(base);
                    return;
                  }
                  setEditorHtml(base ? `${base}<p><br></p>${transcriptHtml}` : transcriptHtml);
                }}
                onStop={(finalText) => {
                  voiceBaseHtmlRef.current = "";
                  if (finalText.trim()) setRedraftOpen(true);
                }}
              />
              <button
                type="button"
                onClick={openRedraftPanel}
                className={[
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-background/70 px-2.5 text-[11px] font-medium text-foreground/90 shadow-sm transition-colors hover:bg-foreground/[0.04]",
                  redraftOpen ? "border-foreground/25 bg-foreground/[0.06]" : "",
                ].join(" ")}
                title="AI redraft"
                aria-expanded={redraftOpen}
                aria-controls="gmail-thread-compose-redraft"
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
              onApply={({ html }) => setEditorHtml(html)}
              panelId="gmail-thread-compose-redraft"
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
      ) : null}
    </>
  );
}
