export type DeepgramStreamEvent =
  | { kind: "interim"; text: string; combined: string }
  | { kind: "final"; text: string; combined: string }
  | { kind: "error"; message: string }
  | { kind: "listening"; listening: boolean };

export type DeepgramSource = "mic" | "tab";

function buildDeepgramListenUrl(): string {
  const params = new URLSearchParams({
    model: "nova-3",
    language: "en",
    punctuate: "true",
    smart_format: "true",
    interim_results: "true",
    diarize: "true",
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

function normalizeChunk(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function personLabel(speaker: number): string {
  const n = Number.isFinite(speaker) && speaker >= 0 ? speaker : 0;
  return `Person ${n + 1}`;
}

type WordPiece = { word?: string; speaker?: number };

/** Group consecutive words by speaker → "Person 1: …" lines. */
function formatDiarizedWords(words: WordPiece[]): string {
  if (!words.length) return "";
  const parts: { sp: number; chunks: string[] }[] = [];
  for (const w of words) {
    const raw = String(w.word ?? "").trim();
    if (!raw) continue;
    const sp = typeof w.speaker === "number" && Number.isFinite(w.speaker) ? w.speaker : 0;
    const last = parts[parts.length - 1];
    if (last && last.sp === sp) {
      last.chunks.push(raw);
    } else {
      parts.push({ sp, chunks: [raw] });
    }
  }
  return parts
    .map((p) => `${personLabel(p.sp)}: ${normalizeChunk(p.chunks.join(" "))}`)
    .join("\n");
}

/** If the newest block continues the same person as the last line of `prev`, merge into that line. */
function mergeLabeledBlocks(prev: string, block: string): string {
  const p = prev.trim();
  const b = block.trim();
  if (!p) return b;
  if (!b) return p;

  const prevLines = p.split("\n");
  const lastIdx = prevLines.length - 1;
  const lastLine = prevLines[lastIdx]!;
  const blockLines = b.split("\n");
  const firstNew = blockLines[0]!;
  const restNew = blockLines.slice(1).join("\n");

  const parsePerson = (line: string) => {
    const m = line.match(/^Person (\d+):\s*([\s\S]*)$/);
    return m ? { num: m[1], body: m[2] ?? "" } : null;
  };

  const a = parsePerson(lastLine);
  const c = parsePerson(firstNew);
  if (a && c && a.num === c.num) {
    const mergedBody = normalizeChunk(`${a.body} ${c.body}`);
    prevLines[lastIdx] = `Person ${a.num}: ${mergedBody}`;
    const head = prevLines.join("\n");
    return restNew.trim() ? `${head}\n${restNew}` : head;
  }
  return `${p}\n${b}`;
}

function combinedDisplay(transcript: string, live: string): string {
  const t = transcript.trim();
  const l = live.trim();
  if (!t) return l;
  if (!l) return t;
  return mergeLabeledBlocks(t, l);
}

export async function startDeepgramStream(opts: {
  source: DeepgramSource;
  onEvent: (e: DeepgramStreamEvent) => void;
  /** If provided, use as Deepgram bearer/token. Otherwise fetch from /api/deepgram/token. */
  deepgramToken?: string;
}): Promise<{
  stop: () => Promise<string>;
}> {
  const { source, onEvent } = opts;
  const wsUrl = buildDeepgramListenUrl();
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

  const ws = new WebSocket(wsUrl, [protocol, token]);

  let recorder: MediaRecorder | null = null;
  let live = "";
  let transcript = "";
  /** Dedup near-identical finals (Deepgram occasionally repeats). */
  let lastFinalFingerprint = "";
  const startedAt = Date.now();

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

    return combinedDisplay(transcript, live).trim();
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
      const alt = msg?.channel?.alternatives?.[0];
      if (!alt) return;

      const text = String(alt.transcript ?? "").trim();
      const words = Array.isArray(alt.words) ? (alt.words as WordPiece[]) : [];
      let labeled = words.length > 0 ? formatDiarizedWords(words) : "";
      if (!labeled && text) labeled = `${personLabel(0)}: ${normalizeChunk(text)}`;

      if (!labeled) return;

      const isFinal = Boolean(msg?.is_final);
      if (isFinal) {
        const fp = words.length ? JSON.stringify(words.map((w) => [w.word, w.speaker])) : labeled;
        if (fp === lastFinalFingerprint) return;
        lastFinalFingerprint = fp;

        transcript = mergeLabeledBlocks(transcript, labeled);
        live = "";
        onEvent({ kind: "final", text: labeled, combined: transcript.trim() });
      } else {
        live = labeled;
        onEvent({ kind: "interim", text: labeled, combined: combinedDisplay(transcript, live) });
      }
    } catch {
      /* ignore */
    }
  };

  return { stop };
}
