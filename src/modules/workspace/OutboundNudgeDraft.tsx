"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { OverviewLens } from "@/lib/workspace/overviewLens";
import { OVERVIEW_LENS_CHIPS } from "@/lib/workspace/overviewLens";
import { useAskBacupStore } from "@/store/askBacupStore";

export type OutboundNudgeDraftProps = {
  kpis: {
    overdue: number;
    todaysLoad: number;
    waitingFollowups: number;
    activePriorities: number;
    pendingDecisions: number;
  };
  openCrossTeamDeps: number;
  dayBriefLines: string[] | null;
};

const CLIENT_OUTBOUND_MS = 1950;

function buildAskBacupRefineDraft(channel: "email" | "chat", lens: OverviewLens, text: string): string {
  return [
    `I drafted this ${channel === "email" ? "email" : "short message"} on Overview (lens: ${lens}). Refine tone and add specifics only where I fill in names—do not invent facts.`,
    "",
    "---",
    text.trim(),
    "---",
  ].join("\n");
}

export function OutboundNudgeDraft({ kpis, openCrossTeamDeps, dayBriefLines }: OutboundNudgeDraftProps) {
  const openWithDraft = useAskBacupStore((s) => s.openWithDraft);

  const [channel, setChannel] = React.useState<"email" | "chat">("email");
  const [lens, setLens] = React.useState<OverviewLens>("all");
  const [text, setText] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<"openai" | "fallback" | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [ms, setMs] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const run = React.useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const tid = setTimeout(() => ac.abort(), CLIENT_OUTBOUND_MS);

    setLoading(true);
    setError(null);
    setNotice(null);
    setMs(null);

    try {
      const res = await fetch("/api/workspace/outbound-nudge-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        signal: ac.signal,
        body: JSON.stringify({
          channel,
          lens,
          kpis,
          openCrossTeamDeps,
          ...(dayBriefLines?.length ? { dayBriefLines: dayBriefLines.slice(0, 6) } : {}),
        }),
      });
      clearTimeout(tid);
      const j = (await res.json().catch(() => null)) as {
        text?: unknown;
        source?: string;
        notice?: string;
        ms?: number;
        error?: string;
      } | null;
      if (!res.ok) {
        setText(null);
        setError(typeof j?.error === "string" ? j.error : `Request failed (${res.status})`);
        return;
      }
      const raw = typeof j?.text === "string" ? j.text : "";
      setText(raw.trim() ? raw : null);
      setSource(j?.source === "openai" ? "openai" : "fallback");
      if (j?.notice === "quota_exceeded") setNotice("AI quota reached—template draft below.");
      else if (j?.notice === "timeout" || j?.notice === "error") setNotice("Fast path timed out—template draft below.");
      else if (j?.notice === "openai_error" || j?.notice === "empty") setNotice("AI unavailable—template draft below.");
      else setNotice(null);
      if (typeof j?.ms === "number") setMs(j.ms);
    } catch (e) {
      clearTimeout(tid);
      if (e instanceof Error && e.name === "AbortError") {
        setText(null);
        setError("Past 2s—try again; nothing is sent from Bacup automatically.");
      } else {
        setText(null);
        setError(e instanceof Error ? e.message : "Could not load draft.");
      }
    } finally {
      setLoading(false);
    }
  }, [channel, lens, kpis, openCrossTeamDeps, dayBriefLines]);

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Draft a nudge</h3>
        {ms != null ? <span className="text-[10px] tabular-nums text-muted-foreground">{ms}ms</span> : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Paste-ready email or short chat text from your Overview KPIs. You send it—Bacup never mails on your behalf.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={loading}
          onClick={() => setChannel("email")}
          className={[
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            channel === "email"
              ? "border-foreground/30 bg-muted text-foreground"
              : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted/50",
            loading ? "opacity-60" : "",
          ].join(" ")}
        >
          Email
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => setChannel("chat")}
          className={[
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            channel === "chat"
              ? "border-foreground/30 bg-muted text-foreground"
              : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted/50",
            loading ? "opacity-60" : "",
          ].join(" ")}
        >
          Quick message
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {OVERVIEW_LENS_CHIPS.map((x) => (
          <button
            key={x.id}
            type="button"
            disabled={loading}
            onClick={() => setLens(x.id)}
            className={[
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              lens === x.id
                ? "border-foreground/30 bg-muted text-foreground"
                : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted/50",
              loading ? "opacity-60" : "",
            ].join(" ")}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={() => void run()}>
          {loading ? "Drafting…" : "Get draft"}
        </Button>
        {text ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void navigator.clipboard.writeText(text)}
            >
              Copy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => openWithDraft(buildAskBacupRefineDraft(channel, lens, text))}
            >
              Refine in Ask Bacup
            </Button>
          </>
        ) : null}
      </div>

      {notice ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{notice}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      {text ? (
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap border-t border-border/50 pt-3 font-sans text-sm leading-snug text-foreground">
          {text}
        </pre>
      ) : null}

      {source === "fallback" && text ? (
        <p className="mt-2 text-[10px] text-muted-foreground">Template draft (offline or quota).</p>
      ) : null}
    </div>
  );
}
