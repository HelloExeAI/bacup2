type DeepgramEvent =
  | { kind: "interim"; text: string; combined: string }
  | { kind: "final"; text: string; combined: string }
  | { kind: "error"; message: string }
  | { kind: "listening"; listening: boolean };

export type DeepgramSource = "mic" | "tab";

const DG_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-3&punctuate=true&smart_format=true&interim_results=true";

function normalizeChunk(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

export async function startDeepgramStream(opts: {
  source: DeepgramSource;
  onEvent: (e: DeepgramEvent) => void;
  /** If provided, use as Deepgram bearer/token. Otherwise fetch from /api/deepgram/token. */
  deepgramToken?: string;
}): Promise<{
  stop: () => Promise<string>;
}> {
  const { source, onEvent } = opts;
  onEvent({ kind: "error", message: "" }); // allow caller to clear error by handling empty

  const getToken = async (): Promise<string> => {
    if (opts.deepgramToken) return opts.deepgramToken;
    const tRes = await fetch("/api/deepgram/token", { method: "POST" });
    const tJson = await tRes.json().catch(() => null);
    if (tRes.ok && tJson?.access_token) return String(tJson.access_token);
    const devKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY ?? null;
    if (devKey) return devKey;
    throw new Error(tJson?.error || `Deepgram token error (${tRes.status})`);
  };

  const token = await getToken();
  const isJwt = token.split(".").length === 3;
  const protocol = isJwt ? "bearer" : "token";

  const stream: MediaStream =
    source === "tab"
      ? await (navigator.mediaDevices as any).getDisplayMedia?.({ audio: true, video: false })
      : await navigator.mediaDevices.getUserMedia({ audio: true });

  let closedByClient = false;
  let keepAliveId: number | null = null;

  const ws = new WebSocket(DG_URL, [protocol, token]);

  let recorder: MediaRecorder | null = null;
  let live = "";
  let transcript = "";
  let lastFinalChunk = "";
  const startedAt = Date.now();

  const combinedText = () => normalizeChunk(`${transcript}${live ? (transcript ? " " : "") + live : ""}`);

  const stop = async () => {
    closedByClient = true;
    if (keepAliveId != null) {
      clearInterval(keepAliveId);
      keepAliveId = null;
    }

    onEvent({ kind: "listening", listening: false });

    try {
      recorder?.stop();
    } catch {
      /* ignore */
    }
    recorder = null;

    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }

    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "Finalize" }));
        ws.send(JSON.stringify({ type: "CloseStream" }));
      }
    } catch {
      /* ignore */
    }
    try {
      ws.close(1000);
    } catch {
      /* ignore */
    }

    const elapsedSec = Math.min(6 * 3600, Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    if (elapsedSec > 0) {
      void fetch("/api/deepgram/usage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seconds: elapsedSec }),
      }).catch(() => {});
    }

    return combinedText();
  };

  ws.onerror = () => {
    if (closedByClient) return;
    onEvent({ kind: "error", message: "Deepgram WebSocket error." });
  };
  ws.onclose = (evt) => {
    if (keepAliveId != null) {
      clearInterval(keepAliveId);
      keepAliveId = null;
    }
    if (closedByClient) return;
    if (evt.code === 1000) return;
    const detail = evt.reason?.trim();
    const hint =
      evt.code === 1005
        ? "Connection dropped (often network, quota, or idle timeout). Check Deepgram quota and try again."
        : "Transcription stopped unexpectedly.";
    onEvent({
      kind: "error",
      message: [hint, detail ? `(${evt.code}) ${detail}` : `(${evt.code})`].filter(Boolean).join(" "),
    });
  };

  ws.onopen = () => {
    onEvent({ kind: "listening", listening: true });
    keepAliveId = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "KeepAlive" }));
        } catch {
          /* ignore */
        }
      }
    }, 4000);
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (evt) => {
      if (evt.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(evt.data);
    };
    recorder.start(250);
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(String(evt.data));
      const text = msg?.channel?.alternatives?.[0]?.transcript ?? "";
      if (!text) return;
      const isFinal = Boolean(msg?.is_final);
      if (isFinal) {
        const c = normalizeChunk(text);
        if (!c) return;
        if (normalizeChunk(lastFinalChunk) === c) return;
        lastFinalChunk = c;
        const normCurrent = normalizeChunk(transcript);
        if (normCurrent && normCurrent.endsWith(c)) return;
        transcript = transcript ? `${transcript} ${c}` : c;
        live = "";
        onEvent({ kind: "final", text: c, combined: combinedText() });
      } else {
        const interim = normalizeChunk(text);
        if (!interim) return;
        live = interim;
        onEvent({ kind: "interim", text: interim, combined: combinedText() });
      }
    } catch {
      /* ignore */
    }
  };

  return { stop };
}

