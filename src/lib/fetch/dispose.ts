/**
 * Use with `controller.abort(FETCH_DISPOSED)` so runtimes/devtools can show a reason
 * instead of the vague “signal is aborted without reason”.
 */
export const FETCH_DISPOSED = new DOMException(
  "Request disposed (React cleanup, navigation, or superseded request)",
  "AbortError",
);

export function isAbortError(e: unknown): boolean {
  if (e == null) return false;
  if (typeof e === "object" && "name" in e && (e as { name: unknown }).name === "AbortError") return true;
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error && e.name === "AbortError") return true;
  return false;
}
