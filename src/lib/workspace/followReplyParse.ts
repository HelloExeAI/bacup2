/** Rule-based reply parsing for Phase D (long-tail → Phase D+ with LLM). */

export type FollowReplyIntent = "done" | "reassigned" | "in_progress" | "noop";

export type FollowReplyStatusLabel = "completed" | "in_progress" | "not_started" | "handed_off";

export function parseFollowReplyText(text: string): {
  intent: FollowReplyIntent;
  status_label: FollowReplyStatusLabel;
  reassignTo?: string;
} {
  const raw = text.replace(/\u00a0/g, " ").trim();
  if (raw.length < 2) return { intent: "noop", status_label: "not_started" };

  const firstLine = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] ?? raw;
  const t = raw.replace(/\s+/g, " ").trim();
  const lower = t.toLowerCase();

  if (/^(done|complete|completed|finished|shipped|closed)\b/i.test(firstLine)) {
    return { intent: "done", status_label: "completed" };
  }
  if (/\b(all done|all set|wrapped up|nothing left)\b/i.test(lower) && t.length < 200) {
    return { intent: "done", status_label: "completed" };
  }

  const re1 =
    /(?:reassign(?:ed)?|hand(?:ed)?\s*off|pass(?:ed|ing)?\s+to|left with)\s*[:\s,-]+(.{1,120})/i.exec(t);
  if (re1?.[1]) {
    const v = re1[1].trim().replace(/[.!?]+$/, "");
    if (v.length >= 2) return { intent: "reassigned", status_label: "handed_off", reassignTo: v };
  }

  const re2 = /@([\w.-]+)\s+(?:is\s+)?(?:handl|cover|own|taking)/i.exec(t);
  if (re2?.[1]) {
    return { intent: "reassigned", status_label: "handed_off", reassignTo: re2[1].trim() };
  }

  if (
    /\b(in progress|wip|working on it|on it|actively)\b/i.test(lower) ||
    /\b(will (?:send )?update|by (?:eod|monday|tuesday|wednesday|thursday|friday|\d{1,2}\/\d{1,2}))\b/i.test(lower)
  ) {
    return { intent: "in_progress", status_label: "in_progress" };
  }

  if (
    /\b(not started|haven'?t started|didn'?t start|not yet|still blocked|blocked on|waiting on|on hold)\b/i.test(
      lower,
    )
  ) {
    return { intent: "noop", status_label: "not_started" };
  }

  return { intent: "noop", status_label: "not_started" };
}
