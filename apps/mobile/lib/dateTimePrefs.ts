import type { DateFormat, TimeFormat } from "@/context/PreferencesContext";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function datePlaceholder(fmt: DateFormat) {
  if (fmt === "dmy") return "DD-MM-YYYY";
  if (fmt === "mdy") return "MM-DD-YYYY";
  return "YYYY-MM-DD";
}

export function timePlaceholder(fmt: TimeFormat) {
  return fmt === "12h" ? "HH:MM AM" : "HH:MM";
}

export function formatDate(ymd: string, fmt: DateFormat) {
  const [y, m, d] = String(ymd).split("-").map((x) => x.trim());
  if (!y || !m || !d) return ymd;
  if (fmt === "dmy") return `${d}-${m}-${y}`;
  if (fmt === "mdy") return `${m}-${d}-${y}`;
  return `${y}-${m}-${d}`;
}

export function parseDate(input: string, fmt: DateFormat): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const parts = raw.split("-").map((x) => x.trim());
  if (parts.length !== 3) return null;

  let y = "";
  let m = "";
  let d = "";
  if (fmt === "ymd") {
    [y, m, d] = parts;
  } else if (fmt === "dmy") {
    [d, m, y] = parts;
  } else {
    [m, d, y] = parts;
  }

  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
  if (yy < 1970 || yy > 2100) return null;
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  return `${yy}-${pad2(mm)}-${pad2(dd)}`;
}

export function formatTime(hhmm: string | null | undefined, fmt: TimeFormat) {
  const raw = String(hhmm ?? "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{2}):(\d{2})/);
  if (!m) return raw;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return raw;
  if (fmt === "24h") return `${pad2(h)}:${pad2(mm)}`;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad2(mm)} ${suffix}`;
}

export function parseTime(input: string, fmt: TimeFormat): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (fmt === "24h") {
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return `${pad2(h)}:${pad2(mm)}`;
  }

  const m = raw.toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = Number(m[2]);
  const suf = m[3];
  if (h < 1 || h > 12 || mm < 0 || mm > 59) return null;
  if (suf === "AM") h = h === 12 ? 0 : h;
  else h = h === 12 ? 12 : h + 12;
  return `${pad2(h)}:${pad2(mm)}`;
}

export function formatTimestamp(iso: string, dateFmt: DateFormat, timeFmt: TimeFormat) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const ymd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const hhmm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const date = formatDate(ymd, dateFmt);
  const time = formatTime(hhmm, timeFmt);
  return time ? `${date} · ${time}` : date;
}

