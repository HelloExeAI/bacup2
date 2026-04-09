"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { OverviewLens } from "@/lib/workspace/overviewLens";
import { OVERVIEW_LENS_CHIPS } from "@/lib/workspace/overviewLens";
import { useAskBacupStore } from "@/store/askBacupStore";

export type FollowLens = OverviewLens;

export type FollowWithBacupProps = {
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

/** Client fetch budget — server aborts OpenAI ~1750ms; total UX stays under 2s. */
const CLIENT_FOLLOW_MS = 1950;

function buildAskBacupDraft(lens: OverviewLens, bullets: string[]): string {
  const lines = bullets.map((b) => `- ${b.replace(/^\s*[-*•]\s*/, "").trim()}`).join("\n");
  return [
    `Overview fast-follow (lens: ${lens}). Plan:`,
    "",
    lines,
    "",
    "Using my full live Bacup workspace (tasks, calendar, scratchpad), refine this into the top 3 next actions with owners and timing.",
  ].join("\n");
}

export function FollowWithBacup({ kpis, openCrossTeamDeps, dayBriefLines }: FollowWithBacupProps) {
  const openWithDraft = useAskBacupStore((s) => s.openWithDraft);

  const [lens, setLens] = React.useState<OverviewLens>("all");
  const [bullets, setBullets] = React.useState<string[] | null>(null);
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
    const tid = setTimeout(() => ac.abort(), CLIENT_FOLLOW_MS);

    setLoading(true);
    setError(null);
    setNotice(null);
    setMs(null);

    try {
      const res = await fetch("/api/workspace/follow-with-bacup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        signal: ac.signal,
        body: JSON.stringify({
          lens,
          kpis,
          openCrossTeamDeps,
          ...(dayBriefLines?.length ? { dayBriefLines: dayBriefLines.slice(0, 6) } : {}),
        }),
      });
      clearTimeout(tid);
      const j = (await res.json().catch(() => null)) as {
        bullets?: unknown;
        source?: string;
        notice?: string;
        ms?: number;
        error?: string;
      } | null;
      if (!res.ok) {
        setBullets(null);
        setError(typeof j?.error === "string" ? j.error : `Request failed (${res.status})`);
        return;
      }
      const raw = Array.isArray(j?.bullets) ? j.bullets.map((x) => String(x)) : [];
      setBullets(raw.length ? raw.slice(0, 5) : null);
      setSource(j?.source === "openai" ? "openai" : "fallback");
      if (j?.notice === "quota_exceeded") setNotice("AI quota reached—showing a quick template.");
      else if (j?.notice === "timeout" || j?.notice === "error") setNotice("Fast path timed out—template plan below.");
      else if (j?.notice === "openai_error") setNotice("AI unavailable—template plan below.");
      else setNotice(null);
      if (typeof j?.ms === "number") setMs(j.ms);
    } catch (e) {
      clearTimeout(tid);
      if (e instanceof Error && e.name === "AbortError") {
        setBullets(null);
        setError("Past 2s—try again; or open Ask Bacup for the full workspace.");
      } else {
        setBullets(null);
        setError(e instanceof Error ? e.message : "Could not load follow plan.");
      }
    } finally {
      setLoading(false);
    }
  }, [lens, kpis, openCrossTeamDeps, dayBriefLines]);

  const copyText = bullets?.length
    ? bullets.map((b) => `- ${b.replace(/^\s*[-*•]\s*/, "").trim()}`).join("\n")
    : "";

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Follow with Bacup</h3>
        {ms != null ? (
          <span className="text-[10px] tabular-nums text-muted-foreground">{ms}ms</span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Fast follow plan from your Overview KPIs (under 2 seconds). Use Ask Bacup for full live workspace depth.
      </p>

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
          {loading ? "Planning…" : "Get plan"}
        </Button>
        {bullets?.length ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!copyText}
              onClick={() => void navigator.clipboard.writeText(copyText)}
            >
              Copy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => openWithDraft(buildAskBacupDraft(lens, bullets))}
            >
              Open in Ask Bacup
            </Button>
          </>
        ) : null}
      </div>

      {notice ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{notice}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      {bullets && bullets.length > 0 ? (
        <ul className="mt-3 list-none space-y-1.5 border-t border-border/50 pt-3 text-sm leading-snug text-foreground">
          {bullets.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">•</span>
              <span>{line.replace(/^\s*[-*•]\s*/, "").trim()}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {source === "fallback" && bullets?.length ? (
        <p className="mt-2 text-[10px] text-muted-foreground">Template plan (offline or quota).</p>
      ) : null}
    </div>
  );
}
