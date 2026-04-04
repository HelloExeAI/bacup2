import type { Task } from "@/store/taskStore";

/** Full “Updated by …” line; name comes from profile display name (see PATCH /api/tasks/[id]). */
export function formatUpdatedByLine(t: Task): string | null {
  const n = t.last_edited_by_name?.trim();
  if (!n) return null;
  return `Updated by ${n}`;
}

/** Short line for tooltips / secondary meta (no border UI). */
export function formatTaskActorHint(t: Task): string {
  const bits: string[] = [];
  const upd = formatUpdatedByLine(t);
  if (upd) bits.push(upd);
  if (t.status === "done" && t.completed_by_name?.trim()) {
    bits.push(`Completed by ${t.completed_by_name.trim()}`);
  }
  return bits.join(" · ");
}
