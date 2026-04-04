import type { Task } from "@/store/taskStore";
import type { Profile } from "@/store/userStore";

/** True when the task is assigned to the current user (self / profile name). */
export function isTaskSelfAssigned(
  task: Pick<Task, "assigned_to">,
  profile: Pick<Profile, "name" | "display_name"> | null | undefined,
): boolean {
  const raw = String(task.assigned_to ?? "").trim();
  if (!raw) return true;
  const a = raw.toLowerCase();
  if (a === "self") return true;
  const dn = profile?.display_name?.trim().toLowerCase();
  const n = profile?.name?.trim().toLowerCase();
  if (dn && a === dn) return true;
  if (n && a === n) return true;
  return false;
}
