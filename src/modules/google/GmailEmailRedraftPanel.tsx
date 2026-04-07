"use client";

import * as React from "react";
import DOMPurify from "dompurify";

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

export function plainEmailBody(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function IconRedraft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.09 3.36h3.53l-2.86 2.08L14.86 12 12 9.92 9.14 12l1.1-3.56-2.86-2.08h3.53L12 3z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M5 20l1.2-3.68a7 7 0 0111.6 0L19 20"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type RedraftApplyPayload = {
  html: string;
  /** Only set when `includeSubject` (new compose). */
  subject?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Current editor HTML when the panel opens (snapshotted on open transition). */
  initialHtml: string;
  onApply: (payload: RedraftApplyPayload) => void;
  panelId?: string;
  /** New email only: API returns subject + body; "Use this" fills both. */
  includeSubject?: boolean;
  /** Current subject when redrafting new mail (optional context for the model). */
  currentSubject?: string;
};

/**
 * AI redraft UI: instructions → preview → Use this / Redraft again.
 * Parent controls visibility with `open`; pass `initialHtml` from the live editor each render.
 */
export function GmailEmailRedraftPanel({
  open,
  onClose,
  initialHtml,
  onApply,
  panelId = "gmail-email-redraft-panel",
  includeSubject = false,
  currentSubject = "",
}: Props) {
  const [step, setStep] = React.useState<"instructions" | "preview">("instructions");
  const [instruction, setInstruction] = React.useState("");
  const [sourceHtml, setSourceHtml] = React.useState("");
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const prevOpenRef = React.useRef(false);

  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      setSourceHtml(initialHtml);
      setInstruction("");
      setPreviewHtml(null);
      setPreviewSubject(null);
      setStep("instructions");
      setErr(null);
    }
    prevOpenRef.current = open;
  }, [open, initialHtml]);

  const submitRedraft = async () => {
    const instr = instruction.trim();
    if (!instr) {
      setErr("Describe how you want the email redrafted (e.g. professional, concise, friendly).");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/integrations/google/gmail/redraft-body", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlBody: sourceHtml,
          instructions: instr,
          composeMode: includeSubject ? "new" : "reply",
          currentSubject: includeSubject ? currentSubject : undefined,
        }),
      });
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const msg =
          typeof j?.message === "string"
            ? j.message
            : typeof j?.error === "string"
              ? j.error
              : "Redraft failed.";
        setErr(msg);
        return;
      }
      const html = typeof j?.html === "string" ? j.html : "";
      if (!html.trim()) {
        setErr("Empty response from AI.");
        return;
      }
      setPreviewHtml(sanitizeEmailHtml(html));
      if (includeSubject && typeof j?.subject === "string" && j.subject.trim()) {
        setPreviewSubject(j.subject.trim());
      } else {
        setPreviewSubject(null);
      }
      setStep("preview");
    } catch {
      setErr("Redraft failed.");
    } finally {
      setLoading(false);
    }
  };

  const usePreview = () => {
    if (!previewHtml) return;
    if (includeSubject && previewSubject) {
      onApply({ html: previewHtml, subject: previewSubject });
    } else {
      onApply({ html: previewHtml });
    }
    onClose();
  };

  const iterateAgain = () => {
    if (!previewHtml) return;
    setSourceHtml(previewHtml);
    setInstruction("");
    setPreviewHtml(null);
    setPreviewSubject(null);
    setStep("instructions");
    setErr(null);
  };

  const handleClose = () => {
    setErr(null);
    setLoading(false);
    setPreviewHtml(null);
    setPreviewSubject(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      id={panelId}
      className="shrink-0 space-y-2 rounded-lg border border-border/60 bg-muted/25 p-3 shadow-sm"
      role="region"
      aria-label="AI redraft"
    >
      {step === "instructions" ? (
        <>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="How do you want to redraft this email? e.g. Professional, concise, friendly tone, shorter paragraphs…"
            rows={3}
            disabled={loading}
            className="min-h-[4.5rem] w-full resize-y rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void submitRedraft()}
              className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Working…" : "Redraft"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleClose}
              className="rounded-lg border border-border/80 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          {includeSubject && previewSubject ? (
            <>
              <p className="text-[11px] font-medium text-foreground">Subject</p>
              <p className="rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-medium text-foreground">
                {previewSubject}
              </p>
            </>
          ) : null}
          <p className="text-[11px] font-medium text-foreground">Body</p>
          <div
            className="max-h-[min(40vh,280px)] overflow-y-auto rounded-md border border-border/50 bg-background p-3 text-sm leading-[1.5] [&_a]:text-blue-600 [&_a]:underline [&_p]:my-1"
            dangerouslySetInnerHTML={{ __html: previewHtml ?? "" }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={usePreview}
              className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              Use this
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={iterateAgain}
              className="rounded-lg border border-border/80 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
            >
              Redraft again
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleClose}
              className="rounded-lg border border-border/80 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </>
      )}
      {err ? <p className="text-[11px] text-red-600/90 dark:text-red-400">{err}</p> : null}
    </div>
  );
}
