import type { Task } from "@/store/taskStore";
import type { Event } from "@/store/eventStore";

export type SamInput = {
  tasks: Array<Pick<Task, "title" | "due_date" | "due_time" | "type" | "assigned_to" | "status">>;
  events: Array<Pick<Event, "title" | "date" | "time">>;
  today_focus: Array<
    Pick<Task, "title" | "due_date" | "due_time" | "type" | "assigned_to" | "status">
  >;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayYmd(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function buildSamInput(allTasks: Task[], allEvents: Event[]): SamInput {
  const today = todayYmd();

  const tasks = allTasks
    .filter((t) => t.status === "pending")
    .slice(0, 15)
    .map((t) => ({
      title: t.title,
      due_date: t.due_date,
      due_time: t.due_time,
      type: t.type,
      assigned_to: t.assigned_to,
      status: t.status,
    }));

  const events = allEvents
    .filter((e) => !!e.date)
    .slice(0, 10)
    .map((e) => ({
      title: e.title,
      date: e.date,
      time: e.time ? String(e.time).slice(0, 5) : null,
    }));

  const today_focus = allTasks
    .filter((t) => t.status === "pending" && t.due_date === today)
    .sort((a, b) => (a.due_time ?? "").localeCompare(b.due_time ?? ""))
    .slice(0, 10)
    .map((t) => ({
      title: t.title,
      due_date: t.due_date,
      due_time: t.due_time,
      type: t.type,
      assigned_to: t.assigned_to,
      status: t.status,
    }));

  return { tasks, events, today_focus };
}

export async function fetchSamSuggestions(input: SamInput): Promise<string[]> {
  const res = await fetch("/api/sam/suggest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `SAM failed (${res.status})`);

  const suggestions = json?.suggestions;
  if (Array.isArray(suggestions)) return suggestions.map(String).slice(0, 8);
  return [];
}

