"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { startDeepgramStream, type DeepgramSource, type DeepgramStreamEvent } from "@/lib/voice/deepgramStream";
import { useMeetingRecorderStore } from "@/store/meetingRecorderStore";
import { useEventStore } from "@/store/eventStore";
import { useTaskStore, type Task } from "@/store/taskStore";

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function ymdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function bestCalendarTitle(events: ReturnType<typeof useEventStore.getState>["events"], now = new Date()): string | null {
  const today = ymdLocal(now);
  const curMin = now.getHours() * 60 + now.getMinutes();
  const sameDay = events.filter((e) => e.date === today && e.time && e.title);
  let best: { title: string; score: number } | null = null;
  for (const e of sameDay) {
    const [hh, mm] = String(e.time).slice(0, 5).split(":").map((x) => Number(x));
    const tmin = (hh || 0) * 60 + (mm || 0);
    const diff = Math.abs(tmin - curMin);
    const score = diff;
    if (!best || score < best.score) best = { title: String(e.title), score };
  }
  if (best && best.score <= 90) return best.title.slice(0, 300);
  return null;
}

export function MeetingRecorderDock() {
  const router = useRouter();
  const events = useEventStore((s) => s.events);
  const addTasks = useTaskStore((s) => s.addTasks);

  const mode = useMeetingRecorderStore((s) => s.mode);
  const source = useMeetingRecorderStore((s) => s.source);
  const session = useMeetingRecorderStore((s) => s.session);
  const open = useMeetingRecorderStore((s) => s.open);
  const close = useMeetingRecorderStore((s) => s.close);
  const minimize = useMeetingRecorderStore((s) => s.minimize);
  const expand = useMeetingRecorderStore((s) => s.expand);
  const setSource = useMeetingRecorderStore((s) => s.setSource);
  const startSession = useMeetingRecorderStore((s) => s.startSession);
  const setTranscript = useMeetingRecorderStore((s) => s.setTranscript);
  const clearSession = useMeetingRecorderStore((s) => s.clearSession);

  const [listening, setListening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [liveCombined, setLiveCombined] = React.useState("");
  const [startedAtMs, setStartedAtMs] = React.useState<number | null>(null);
  const [tick, setTick] = React.useState(0);
  const [stopping, setStopping] = React.useState(false);

  const streamStopRef = React.useRef<null | (() => Promise<string>)>(null);

  React.useEffect(() => {
    if (!listening) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [listening]);

  const elapsed = startedAtMs != null ? fmtElapsed(Date.now() - startedAtMs + tick * 0) : "00:00";

  const start = async () => {
    setError(null);
    const cal = bestCalendarTitle(events);
    startSession(cal);
    setStartedAtMs(Date.now());
    setListening(true);

    try {
      const onEvent = (e: DeepgramStreamEvent) => {
        if (e.kind === "error") {
          const msg = e.message?.trim();
          if (!msg) return;
          setError(msg);
          return;
        }
        if (e.kind === "listening") {
          setListening(e.listening);
          return;
        }
        setLiveCombined(e.combined);
        setTranscript(e.combined);
      };

      const tryStart = async (s: DeepgramSource) => startDeepgramStream({ source: s, onEvent });

      let handle:
        | {
            stop: () => Promise<string>;
          }
        | null = null;

      if (source === "tab") {
        handle = await tryStart("tab");
      } else if (source === "smart") {
        try {
          handle = await tryStart("tab");
        } catch {
          handle = await tryStart("mic");
        }
      } else {
        handle = await tryStart("mic");
      }

      streamStopRef.current = handle.stop;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start recording.");
      setListening(false);
      setStartedAtMs(null);
      streamStopRef.current = null;
    }
  };

  const stopAndSave = async () => {
    if (stopping) return;
    setStopping(true);
    setError(null);
    try {
      const stopFn = streamStopRef.current;
      streamStopRef.current = null;
      const finalText = stopFn ? await stopFn() : session?.transcript ?? liveCombined;
      setListening(false);
      setStartedAtMs(null);

      const started_at = session?.started_at ?? new Date().toISOString();
      const ended_at = new Date().toISOString();
      const calendar_title = session?.calendar_title ?? null;

      const res = await fetch("/api/meetings/session/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ started_at, ended_at, transcript: finalText, calendar_title }),
      });
      const j = (await res.json().catch(() => null)) as {
        error?: string;
        parent_note_id?: string;
        child_note_id?: string;
        tasks?: Task[];
      } | null;
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Failed to save meeting.");

      if (Array.isArray(j?.tasks) && j!.tasks!.length > 0) {
        addTasks(j!.tasks!);
      }

      clearSession();
      setLiveCombined("");
      if (mode !== "closed") close();
      router.push("/scratchpad?view=meetings");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save meeting.");
    } finally {
      setStopping(false);
    }
  };

  if (mode === "closed") return null;

  const isMin = mode === "minimized_floating";
  const wrapClass = isMin
    ? "fixed bottom-4 right-4 z-[90] w-[min(92vw,22rem)] rounded-2xl border border-border bg-background/95 shadow-[0_16px_55px_rgba(0,0,0,0.22)] backdrop-blur"
    : "fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center";

  const miniStatus =
    listening ? `Recording · ${elapsed}` : session?.started_at ? "Ready to record" : "Ready to record";

  return (
    <div className={wrapClass} aria-label="Meeting recorder">
      {!isMin ? (
        <button
          type="button"
          className="absolute inset-0 bg-black/30"
          aria-label="Dismiss"
          onClick={() => {
            if (listening) minimize();
            else close();
          }}
        />
      ) : null}

      <div
        className={[
          "relative w-full overflow-hidden rounded-2xl border border-border bg-background/98 font-sans",
          !isMin ? "max-w-[min(920px,calc(100vw-24px))]" : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Meeting recording</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {listening ? `Live · ${elapsed}` : "Ready"}
              {session?.calendar_title ? ` · ${session.calendar_title}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isMin ? (
              <Button type="button" size="sm" variant="ghost" className="h-8 border border-border/60" onClick={minimize}>
                Minimize
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" className="h-8 border border-border/60" onClick={close}>
              Close
            </Button>
          </div>
        </div>

        <div className="px-4 py-3">
          {error ? (
            <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-900 dark:text-red-100">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11px] font-medium text-muted-foreground">Input</div>
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={source}
              onChange={(e) => setSource(e.target.value as "smart" | "mic" | "tab")}
              disabled={listening}
            >
              <option value="smart">Mic + browser</option>
              <option value="mic">Mic only</option>
              <option value="tab">Browser tab only</option>
            </select>
            <div className="flex-1" />
            {!listening ? (
              <Button type="button" onClick={() => void start()}>
                Start
              </Button>
            ) : (
              <Button type="button" onClick={() => void stopAndSave()} disabled={stopping}>
                {stopping ? "Stopping…" : "Stop & save"}
              </Button>
            )}
          </div>

          {!isMin ? (
            <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Live transcript</div>
              <div className="mt-2 max-h-[min(52vh,28rem)] overflow-y-auto whitespace-pre-wrap text-sm font-sans leading-relaxed text-foreground antialiased">
                {liveCombined || "…"}
              </div>
            </div>
          ) : (
            <div className="pb-3 pt-2">
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {miniStatus}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" className="h-8 border border-border/60" onClick={expand}>
                  Expand
                </Button>
                {!listening ? (
                  <Button type="button" size="sm" onClick={() => void start()}>
                    Start
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={() => void stopAndSave()} disabled={stopping || !listening}>
                    {stopping ? "Stopping…" : "Stop"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
