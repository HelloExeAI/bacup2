import { DEEPGRAM_LANGUAGE_OPTIONS } from "@/lib/deepgramLanguages";
import { endonymForLanguageCode } from "@/lib/languageEndonyms";
import { WHISPER_LANGUAGE_CODES } from "@/lib/whisperLanguageCodes";

export type TranscriptionLanguageOption = {
  value: string;
  label: string;
  /** Bacup prefers Deepgram STT when true; otherwise OpenAI Whisper (or web parity). */
  deepgram: boolean;
  /** OpenAI speech-to-text supports this ISO-style code. */
  openai: boolean;
};

function withEndonym(code: string, englishLabel: string): string {
  const endo = endonymForLanguageCode(code);
  if (!endo) return englishLabel;
  const e = englishLabel.trim();
  const n = endo.trim();
  if (!e || !n) return englishLabel;
  if (n.toLowerCase() === e.toLowerCase()) return englishLabel;
  return `${n} — ${e}`;
}

function buildOptions(): TranscriptionLanguageOption[] {
  const byValue = new Map<string, TranscriptionLanguageOption>();

  for (const d of DEEPGRAM_LANGUAGE_OPTIONS) {
    const openai = d.value !== "multi";
    byValue.set(d.value, {
      value: d.value,
      label: withEndonym(d.value, d.label),
      deepgram: true,
      openai,
    });
  }

  for (const w of WHISPER_LANGUAGE_CODES) {
    if (byValue.has(w.code)) {
      const cur = byValue.get(w.code)!;
      cur.openai = true;
      continue;
    }
    byValue.set(w.code, {
      value: w.code,
      label: withEndonym(w.code, `${w.name} (${w.code})`),
      deepgram: false,
      openai: true,
    });
  }

  return [...byValue.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export const TRANSCRIPTION_LANGUAGE_OPTIONS: TranscriptionLanguageOption[] = buildOptions();

export function subtitleForTranscriptionLanguage(opt: TranscriptionLanguageOption): string {
  if (opt.deepgram && opt.openai) return "Voice & notes: Deepgram preferred, OpenAI Whisper fallback";
  if (opt.deepgram) return "Voice & notes: Deepgram (multilingual detect)";
  return "Voice & notes: OpenAI Whisper (language not on Deepgram list)";
}

export function findTranscriptionLanguage(value: string): TranscriptionLanguageOption | undefined {
  return TRANSCRIPTION_LANGUAGE_OPTIONS.find((o) => o.value === value);
}
