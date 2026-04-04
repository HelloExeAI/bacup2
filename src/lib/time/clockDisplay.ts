/**
 * Clock display uses IANA zones + Intl so DST and travel are correct when the
 * effective zone updates (device mode follows the browser/OS zone).
 */

export type ClockDisplayFormat = "12h" | "24h";
export type ClockTimezoneSource = "device" | "profile";

export function coerceClockDisplayFormat(v: unknown): ClockDisplayFormat {
  return v === "24h" ? "24h" : "12h";
}

/** Browser-reported IANA zone (changes when the user travels if the OS updates). */
export function getDeviceTimeZoneId(): string | null {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") return null;
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof z === "string" && z.trim() ? z.trim() : null;
  } catch {
    return null;
  }
}

export function isValidIanaTimeZone(zone: string): boolean {
  const z = zone.trim();
  if (!z) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: z }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Zone used for the header clock.
 * - `device`: browser zone (trust OS when traveling).
 * - `profile`: saved profile timezone, with safe fallbacks.
 */
export function resolveClockTimeZone(
  source: ClockTimezoneSource,
  profileTimeZone: string | null | undefined,
): string {
  if (source === "device") {
    const d = getDeviceTimeZoneId();
    if (d && isValidIanaTimeZone(d)) return d;
    const p = profileTimeZone?.trim();
    if (p && isValidIanaTimeZone(p)) return p;
    return "UTC";
  }
  const p = profileTimeZone?.trim();
  if (p && isValidIanaTimeZone(p)) return p;
  const d = getDeviceTimeZoneId();
  if (d && isValidIanaTimeZone(d)) return d;
  return "UTC";
}

export type ClockFaceParts = {
  hour: string;
  minute: string;
  second: string;
  dayPeriod: "AM" | "PM" | null;
};

export function getClockFaceParts(date: Date, timeZone: string, format: ClockDisplayFormat): ClockFaceParts {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";

  if (format === "24h") {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    const second = parts.find((p) => p.type === "second")?.value ?? "00";
    return { hour, minute, second, dayPeriod: null };
  }

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const parts = dtf.formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "12";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const second = parts.find((p) => p.type === "second")?.value ?? "00";
  const dp = parts.find((p) => p.type === "dayPeriod")?.value;
  const dayPeriod = dp === "AM" || dp === "PM" ? dp : null;
  return { hour, minute, second, dayPeriod };
}

export function formatClockAriaLabel(date: Date, timeZone: string, format: ClockDisplayFormat): string {
  const { hour, minute, second, dayPeriod } = getClockFaceParts(date, timeZone, format);
  const base =
    format === "24h"
      ? `${hour}:${minute}:${second}`
      : `${hour}:${minute}:${second}${dayPeriod ? ` ${dayPeriod}` : ""}`;
  return `Local time ${base}, ${timeZone}`;
}
