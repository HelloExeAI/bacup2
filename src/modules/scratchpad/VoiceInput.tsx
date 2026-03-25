"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useTaskStore } from "@/store/taskStore";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMyEvents } from "@/lib/supabase/queries";
import { useEventStore } from "@/store/eventStore";

type Props = {
  onTranscript?: (text: string) => void;
};

const DG_URL =
  "wss://api.deepgram.com/v2/listen?model=nova-2&punctuate=true&smart_format=true";

export function VoiceInput({ onTranscript }: Props) {
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

    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    const transcript = `${finalText}${live ? (finalText ? " " : "") + live : ""}`.trim();
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
    }
  }

  async function start() {
    setError(null);
    if (!supported) return;

    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
    if (!apiKey) {
      setError(
        "Missing NEXT_PUBLIC_DEEPGRAM_API_KEY. Add it to /Users/farooq/Desktop/bacup2/.env.local and restart dev server.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ws = new WebSocket(DG_URL, ["token", apiKey]);
      wsRef.current = ws;

      ws.onopen = () => {
        setListening(true);
        setLive("");
        setFinalText("");
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
            setFinalText((prev) => (prev ? `${prev} ${text}` : text));
            setLive("");
            onTranscript?.(text);
          } else {
            setLive(text);
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => setError("Deepgram WebSocket error.");
      ws.onclose = (evt) => {
        // Helpful for diagnosing auth/format issues.
        if (evt.code !== 1000) {
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

