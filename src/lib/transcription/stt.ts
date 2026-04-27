import { DEEPGRAM_LANGUAGE_OPTIONS } from "@/modules/settings/deepgramLanguages";

type SttProvider = "deepgram" | "openai";

const DEEPGRAM_CODE_SET = new Set(DEEPGRAM_LANGUAGE_OPTIONS.map((o) => o.value));

function normalizeLang(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim();
  return v || "en";
}

export function sttPriorityForLanguage(languageCode: string | null | undefined): SttProvider[] {
  const code = normalizeLang(languageCode);
  if (code === "multi") return ["deepgram", "openai"];
  if (DEEPGRAM_CODE_SET.has(code)) return ["deepgram", "openai"];
  return ["openai", "deepgram"];
}

async function transcribeDeepgram(opts: {
  audio: ArrayBuffer;
  mimeType: string;
  languageCode: string;
}): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing DEEPGRAM_API_KEY on server.");

  const code = normalizeLang(opts.languageCode);
  const params = new URLSearchParams();
  // Prefer Nova-2 defaults; allow language=multi (auto) too.
  params.set("model", "nova-2");
  params.set("punctuate", "true");
  params.set("smart_format", "true");
  params.set("language", code);

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": opts.mimeType || "application/octet-stream",
    },
    body: Buffer.from(opts.audio),
  });

  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (j as any)?.err_msg || (j as any)?.error || `Deepgram STT failed (${res.status})`;
    throw new Error(String(msg));
  }

  const transcript: string =
    (j as any)?.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
    (j as any)?.results?.alternatives?.[0]?.transcript ??
    "";
  const t = String(transcript || "").trim();
  if (!t) throw new Error("Deepgram returned an empty transcript.");
  return t;
}

async function transcribeOpenAI(opts: {
  audio: ArrayBuffer;
  mimeType: string;
  languageCode: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY on server.");

  const code = normalizeLang(opts.languageCode);
  const fd = new FormData();
  fd.append("model", "whisper-1");
  // OpenAI accepts a file upload; filename matters for some mime sniffing.
  fd.append("file", new Blob([opts.audio], { type: opts.mimeType || "application/octet-stream" }), "audio");
  // Whisper supports many languages, but language is optional; include unless multi/auto.
  if (code !== "multi") fd.append("language", code);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });

  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (j as any)?.error?.message || `OpenAI STT failed (${res.status})`;
    throw new Error(String(msg));
  }

  const text: string = (j as any)?.text ?? "";
  const t = String(text || "").trim();
  if (!t) throw new Error("OpenAI returned an empty transcript.");
  return t;
}

export async function transcribeWithDeepgramFirstFallbackOpenAI(opts: {
  audio: ArrayBuffer;
  mimeType: string;
  languageCode: string | null | undefined;
}): Promise<{ provider: SttProvider; transcript: string }> {
  const code = normalizeLang(opts.languageCode);
  const priority = sttPriorityForLanguage(code);

  let lastErr: Error | null = null;
  for (const provider of priority) {
    try {
      if (provider === "deepgram") {
        const transcript = await transcribeDeepgram({ audio: opts.audio, mimeType: opts.mimeType, languageCode: code });
        return { provider, transcript };
      }
      const transcript = await transcribeOpenAI({ audio: opts.audio, mimeType: opts.mimeType, languageCode: code });
      return { provider, transcript };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      // Rule: if Deepgram supports the language, we try Deepgram first; on ANY Deepgram error, switch to OpenAI.
      // If OpenAI fails too, bubble the latest error.
      continue;
    }
  }

  throw lastErr ?? new Error("Transcription failed.");
}

