/** IANA time zone from the OS (follows device / region settings). */
export function readDeviceIanaTimeZone(): string | null {
  try {
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (typeof tz === "string" && tz.trim()) return tz.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}
