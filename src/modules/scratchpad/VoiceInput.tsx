"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useTaskStore } from "@/store/taskStore";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMyEvents } from "@/lib/supabase/queries";
import { useEventStore } from "@/store/eventStore";

type Props = {
  onTranscript?: (text: string) => void;
  compact?: boolean;
};

const DG_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&smart_format=true&interim_results=true";

export function VoiceInput({ onTranscript, compact }: Props) {
  const [supported, setSupported] = React.useState(true);
  const [listening, setListening] = React.useState(false);
  const [live, setLive] = React.useState("");
  const [finalText, setFinalText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const addTasks = useTaskStore((s) => s.addTasks);
  const setEvents = useEventStore((s) => s.setEvents);

  const wsRef = React.useRef<WebSocket | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const transcriptRef = React.useRef<string>("");
  const lastFinalChunkRef = React.useRef<string>("");

  function normalizeChunk(s: string) {
    return s.trim().replace(/\s+/g, " ");
  }

  function appendFinalChunk(chunk: string) {
    const c = normalizeChunk(chunk);
    if (!c) return;

    // Drop duplicates (Deepgram can resend final chunks).
    if (normalizeChunk(lastFinalChunkRef.current) === c) return;
    lastFinalChunkRef.current = c;

    const current = transcriptRef.current;
    const normCurrent = normalizeChunk(current);

    // Avoid appending if it's already a suffix.
    if (normCurrent && normCurrent.endsWith(c)) return;

    transcriptRef.current = current ? `${current} ${c}` : c;
    setFinalText(transcriptRef.current);
    onTranscript?.(c);
  }

  React.useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined" &&
      typeof WebSocket !== "undefined";
    setSupported(ok);
  }, []);

  async function stop() {
    setListening(false);
    recorderRef.current?.stop();
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Ask Deepgram to flush and close cleanly.
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "Finalize" }));
        ws.send(JSON.stringify({ type: "CloseStream" }));
      }
    } catch {}

    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    const transcript = normalizeChunk(
      `${transcriptRef.current}${live ? (transcriptRef.current ? " " : "") + live : ""}`,
    );
    setLive("");

    if (!transcript) return;

    try {
      const res = await fetch("/api/voice/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript, create_children: false }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Save failed (${res.status})`);

      addTasks((j?.tasks ?? []) as any);

      // Refresh events (DB trigger creates them).
      const supabase = createSupabaseBrowserClient();
      const events = await fetchMyEvents(supabase);
      setEvents(events);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save voice note.";
      setError(msg);
    } finally {
      setFinalText("");
      transcriptRef.current = "";
      lastFinalChunkRef.current = "";
    }
  }

  async function start() {
    setError(null);
    if (!supported) return;

    // Prefer short-lived token minted server-side (no key exposure).
    let bearerToken: string | null = null;
    const tRes = await fetch("/api/deepgram/token", { method: "POST" });
    const tJson = await tRes.json().catch(() => null);
    if (tRes.ok && tJson?.access_token) bearerToken = String(tJson.access_token);

    if (!bearerToken) {
      // Optional dev fallback (exposes key to browser).
      const devKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY ?? null;
      if (devKey) {
        bearerToken = devKey;
      } else {
        setError(tJson?.error || `Deepgram token error (${tRes.status})`);
        return;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      if (!bearerToken) {
        setError("Deepgram auth token missing.");
        return;
      }

      // Deepgram browser auth:
      // - API key: Sec-WebSocket-Protocol: token, <api_key>
      // - JWT from /auth/grant: Sec-WebSocket-Protocol: bearer, <jwt>
      const isJwt = bearerToken.split(".").length === 3;
      const protocol = isJwt ? "bearer" : "token";
      const ws = new WebSocket(DG_URL, [protocol, bearerToken]);
      wsRef.current = ws;

      ws.onopen = () => {
        setListening(true);
        setLive("");
        setFinalText("");
        transcriptRef.current = "";
        lastFinalChunkRef.current = "";
        const mime =
          MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "";
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorderRef.current = rec;

        rec.ondataavailable = (evt) => {
          if (evt.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(evt.data);
          }
        };

        rec.start(250);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data));
          const text = msg?.channel?.alternatives?.[0]?.transcript ?? "";
          if (!text) return;

          // Deepgram sends interim and final results.
          const isFinal = Boolean(msg?.is_final);
          if (isFinal) {
            appendFinalChunk(text);
            setLive("");
          } else {
            // Interim results can repeat; only display the latest interim.
            setLive(normalizeChunk(text));
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => setError("Deepgram WebSocket error.");
      ws.onclose = (evt) => {
        // Helpful for diagnosing auth/format issues.
        // 1000 = normal, 1005 = no status (treat as normal for some browsers), 1006 = abnormal.
        if (![1000, 1005].includes(evt.code)) {
          setError(`Deepgram closed (${evt.code}) ${evt.reason || ""}`.trim());
        }
        wsRef.current = null;
        recorderRef.current = null;
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Microphone permission denied.";
      setError(msg);
      await stop();
    }
  }

  if (!supported) {
    return (
      <div className="text-xs text-muted-foreground">
        Voice input isn’t supported in this browser.
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void (listening ? stop() : start())}
          aria-label={listening ? "Stop mic" : "Start mic"}
        >
          {listening ? "Mic on" : "Mic"}
        </Button>
        <span
          className={[
            "h-2 w-2 rounded-full",
            listening ? "bg-foreground" : "bg-border",
          ].join(" ")}
          aria-hidden="true"
        />
        {error ? <div className="text-xs text-muted-foreground">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={listening ? "primary" : "ghost"}
            onClick={() => void (listening ? stop() : start())}
          >
            {listening ? "Stop mic" : "Start mic"}
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={[
                "h-2 w-2 rounded-full",
                listening ? "bg-foreground" : "bg-border",
              ].join(" ")}
              aria-hidden="true"
            />
            {listening ? "Recording…" : "Voice input"}
          </div>
        </div>
        {error ? <div className="text-xs text-muted-foreground">{error}</div> : null}
      </div>

      {(finalText || live) ? (
        <div className="mt-3 rounded-md border border-border bg-muted p-2 text-sm">
          <span className="text-foreground">{finalText}</span>
          {live ? <span className="text-muted-foreground"> {live}</span> : null}
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">
          Start speaking. When you stop, the transcript will be saved as a voice note and tasks will
          be extracted.
        </div>
      )}
    </div>
  );
}

