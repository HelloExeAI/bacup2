import { isAbortError } from "@/lib/fetch/dispose";

const INSTALLED = "__bacupBenignAbortNoise";

/**
 * Next.js / Turbopack and some browser paths log or reject with `AbortError` for normal
 * cancellations (prefetch, HMR, React effect cleanup). Those are not app bugs.
 */
export function installBenignAbortNoiseFilter(): void {
  if (typeof window === "undefined") return;
  const g = globalThis as unknown as { [INSTALLED]?: boolean };
  if (g[INSTALLED]) return;
  g[INSTALLED] = true;

  window.addEventListener("unhandledrejection", (ev) => {
    if (isAbortError(ev.reason)) ev.preventDefault();
  });

  if (process.env.NODE_ENV !== "development") return;

  const needle = "signal is aborted without reason";
  const mentionsNoReasonAbort = (args: unknown[]) =>
    args.some((a) => {
      try {
        if (typeof a === "string") return a.includes(needle);
        if (a instanceof Error) return a.message.includes(needle);
        return String(a).includes(needle);
      } catch {
        return false;
      }
    });

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (mentionsNoReasonAbort(args)) return;
    origError(...args);
  };

  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (mentionsNoReasonAbort(args)) return;
    origWarn(...args);
  };
}
