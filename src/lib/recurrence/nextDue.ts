import type { RecurrenceRule } from "@/lib/recurrence/types";
import { addDaysYmd, addMonthsYmd, ymdCompare } from "@/lib/recurrence/dateYmd";

function monthsStep(rule: RecurrenceRule): number {
  switch (rule.frequency) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "half_yearly":
      return 6;
    case "yearly":
      return 12;
    default:
      return 0;
  }
}

/**
 * Next occurrence strictly after `lastYmd` (the due date of the instance just finished).
 */
export function nextDueAfter(lastYmd: string, rule: RecurrenceRule): string {
  switch (rule.frequency) {
    case "daily":
      return addDaysYmd(lastYmd, 1);
    case "weekly": {
      return addDaysYmd(lastYmd, 7);
    }
    case "monthly":
    case "quarterly":
    case "half_yearly":
    case "yearly": {
      const step = monthsStep(rule);
      return addMonthsYmd(lastYmd, step);
    }
    default: {
      const _exhaustive: never = rule.frequency;
      return _exhaustive;
    }
  }
}

/**
 * First scheduled date on or after `fromYmd`, aligned to anchor pattern (for recovery after delete).
 */
export function firstDueOnOrAfter(anchorYmd: string, rule: RecurrenceRule, fromYmd: string): string {
  let cursor = anchorYmd;
  const maxSteps = 4000;
  let steps = 0;
  while (ymdCompare(cursor, fromYmd) < 0 && steps < maxSteps) {
    cursor = nextDueAfter(cursor, rule);
    steps += 1;
  }
  return cursor;
}
