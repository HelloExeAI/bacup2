export type ParsedTask = {
  title: string;
  description: string;
  due_date: string | null; // YYYY-MM-DD
};

const KEYWORDS = [
  "call",
  "send",
  "follow up",
  "fix",
  "complete",
  "schedule",
  "meeting",
] as const;

function isTaskLine(raw: string) {
  const s = raw.trim();
  if (!s) return false;
  if (s.startsWith("-")) return true;
  if (s.startsWith("[ ]")) return true;

  const lower = s.toLowerCase();
  return KEYWORDS.some((k) => lower.includes(k));
}

function cleanTitle(raw: string) {
  let s = raw.trim();
  if (s.startsWith("[ ]")) s = s.slice(3).trim();
  if (s.startsWith("-")) s = s.slice(1).trim();
  return s.replace(/\s+/g, " ").slice(0, 120);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nextWeekday(base: Date, weekday: number) {
  // weekday: 0=Sun..6=Sat
  const d = new Date(base);
  const diff = (weekday + 7 - d.getDay()) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
  return d;
}

function parseDueDate(line: string, now = new Date()): string | null {
  const s = line.toLowerCase();
  if (s.includes("today")) return toYmd(now);
  if (s.includes("tomorrow")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toYmd(d);
  }

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  for (const [name, idx] of Object.entries(weekdays)) {
    if (s.includes(name)) return toYmd(nextWeekday(now, idx));
  }

  return null;
}

export function parseTasks(content: string): ParsedTask[] {
  const lines = content.split("\n");
  const tasks: ParsedTask[] = [];

  for (const raw of lines) {
    if (!isTaskLine(raw)) continue;

    const title = cleanTitle(raw);
    if (!title) continue;

    tasks.push({
      title,
      description: raw.trim(),
      due_date: parseDueDate(raw),
    });
  }

  // Dedupe by normalized title (keeps first occurrence)
  const seen = new Set<string>();
  return tasks.filter((t) => {
    const key = t.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

