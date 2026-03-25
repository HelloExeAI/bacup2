"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  onTranscript?: (text: string) => void;
};

const DG_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&smart_format=true";

export function VoiceInput({ onTranscript }: Props) {
  const [supported, setSupported] = React.useState(true);
  const [listening, setListening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
          const text =
            msg?.channel?.alternatives?.[0]?.transcript ??
            msg?.channel?.alternatives?.[0]?.paragraphs?.transcript ??
            "";
          if (text) onTranscript?.(text);
        } catch {
          // ignore
        }
      };

      ws.onerror = () => setError("Deepgram WebSocket error.");
      ws.onclose = () => {
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
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={listening ? "primary" : "ghost"}
        onClick={() => void (listening ? stop() : start())}
      >
        {listening ? "Stop mic" : "Start mic"}
      </Button>
      {error ? <div className="text-xs text-muted-foreground">{error}</div> : null}
    </div>
  );
}

