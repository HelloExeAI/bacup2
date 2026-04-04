import type { RecurrenceRule } from "@/lib/recurrence/types";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatRecurrenceLabel(rule: RecurrenceRule): string {
  switch (rule.frequency) {
    case "daily":
      return "Daily";
    case "weekly": {
      const w = rule.by_weekday;
      if (w != null && w >= 1 && w <= 7) return `Weekly · ${WD[w - 1]}`;
      return "Weekly";
    }
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "half_yearly":
      return "Every 6 months";
    case "yearly":
      return "Yearly";
    default: {
      const _e: never = rule.frequency;
      return _e;
    }
  }
}
