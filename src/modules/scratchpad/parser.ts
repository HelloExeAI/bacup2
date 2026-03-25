export type ParsedTask = {
  title: string;
  description: string;
  type: "todo" | "followup" | "reminder";
  assigned_to: string;
  due_date: string | null; // YYYY-MM-DD
  due_time: string | null; // HH:MM (24h)
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

const FOLLOWUP_HINTS = ["ask", "tell", "follow up with", "check with"] as const;

function isTaskLine(raw: string) {
  const s = raw.trim();
  if (!s) return false;
  if (s.startsWith("-")) return true;
  if (s.startsWith("[ ]")) return true;

  const lower = s.toLowerCase();
  return (
    KEYWORDS.some((k) => lower.includes(k)) ||
    lower.includes("remind me") ||
    FOLLOWUP_HINTS.some((k) => lower.includes(k))
  );
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
  if (s.includes("yesterday")) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return toYmd(d);
  }
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

function toDueTime24h(line: string): string | null {
  const s = line.toLowerCase();

  // 14:00 / 9:05
  const h24 = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) {
    const hh = Number(h24[1]);
    const mm = Number(h24[2]);
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  // 5pm / 5 pm / 11am
  const h12 = s.match(/\b(1[0-2]|0?[1-9])\s*(am|pm)\b/);
  if (h12) {
    let hh = Number(h12[1]);
    const mm = 0;
    const ampm = h12[2];
    if (ampm === "pm" && hh !== 12) hh += 12;
    if (ampm === "am" && hh === 12) hh = 0;
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  return null;
}

function extractAssignedTo(line: string): string | null {
  const s = line.trim();

  // "ask John ..." or "tell Sarah ..."
  const m1 = s.match(/^\s*(ask|tell)\s+([A-Z][a-zA-Z]+)\b/);
  if (m1) return m1[2] ?? null;

  // "follow up with John ..." / "check with John ..."
  const m2 = s.match(/\b(follow up with|check with)\s+([A-Z][a-zA-Z]+)\b/i);
  if (m2) return m2[2] ?? null;

  return null;
}

function classify(line: string) {
  const lower = line.toLowerCase();
  const dueTime = toDueTime24h(line);

  if (lower.includes("remind me") || /\bat\s+/.test(lower) && dueTime) {
    return { type: "reminder" as const, assigned_to: "self" };
  }

  if (FOLLOWUP_HINTS.some((k) => lower.includes(k))) {
    const name = extractAssignedTo(line);
    return { type: "followup" as const, assigned_to: name ?? "self" };
  }

  return { type: "todo" as const, assigned_to: "self" };
}

export function parseTasks(content: string): ParsedTask[] {
  const lines = content.split("\n");
  const tasks: ParsedTask[] = [];

  for (const raw of lines) {
    if (!isTaskLine(raw)) continue;

    const title = cleanTitle(raw);
    if (!title) continue;

    const meta = classify(raw);
    tasks.push({
      title,
      description: raw.trim(),
      type: meta.type,
      assigned_to: meta.assigned_to,
      due_date: parseDueDate(raw),
      due_time: toDueTime24h(raw),
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

