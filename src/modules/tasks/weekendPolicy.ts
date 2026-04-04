"use client";

export type WeekendMode = "sat_sun" | "sun" | "alternate_sat_sun";

type WeekendConfig = {
  mode: WeekendMode;
  // For alternate Saturdays:
  // true => 2nd and 4th Saturdays are weekends
  // false => 1st, 3rd, and 5th Saturdays are weekends
  secondAndFourthSaturdayOff?: boolean;
};

const DEFAULT_CONFIG: WeekendConfig = {
  mode: "sat_sun",
  secondAndFourthSaturdayOff: true,
};

const STORAGE_KEY = "bacup_calendar_weekend_config";

function nthSaturdayOfMonth(d: Date) {
  return Math.floor((d.getDate() - 1) / 7) + 1;
}

function isWeekendByConfig(d: Date, cfg: WeekendConfig) {
  const day = d.getDay(); // 0 Sunday ... 6 Saturday
  if (cfg.mode === "sun") return day === 0;
  if (cfg.mode === "sat_sun") return day === 0 || day === 6;
  if (day === 0) return true;
  if (day !== 6) return false;
  const nth = nthSaturdayOfMonth(d);
  const secondAndFourth = cfg.secondAndFourthSaturdayOff !== false;
  return secondAndFourth ? nth === 2 || nth === 4 : nth === 1 || nth === 3 || nth === 5;
}

export function readWeekendConfig(): WeekendConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<WeekendConfig>;
    if (
      parsed.mode !== "sat_sun" &&
      parsed.mode !== "sun" &&
      parsed.mode !== "alternate_sat_sun"
    ) {
      return DEFAULT_CONFIG;
    }
    return {
      mode: parsed.mode,
      secondAndFourthSaturdayOff: parsed.secondAndFourthSaturdayOff !== false,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nextWorkingDate(fromYmd: string, cfg: WeekendConfig) {
  const [y, m, d] = fromYmd.split("-").map(Number);
  const cur = new Date(y || 0, (m || 1) - 1, d || 1);
  cur.setDate(cur.getDate() + 1);
  while (isWeekendByConfig(cur, cfg)) cur.setDate(cur.getDate() + 1);
  return ymd(cur);
}

