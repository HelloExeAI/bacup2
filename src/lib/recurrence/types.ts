import { z } from "zod";

export const RecurrenceFrequencySchema = z.enum([
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
]);

export type RecurrenceFrequency = z.infer<typeof RecurrenceFrequencySchema>;

/** Stored in task_recurrence_series.recurrence_rule */
export const RecurrenceRuleSchema = z.object({
  frequency: RecurrenceFrequencySchema,
  /** ISO weekday 1 = Monday … 7 = Sunday (optional; weekly uses anchor weekday if omitted) */
  by_weekday: z.number().int().min(1).max(7).optional(),
  /** Day of month 1–31 for monthly-style patterns */
  by_month_day: z.number().int().min(1).max(31).optional(),
});

export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;
