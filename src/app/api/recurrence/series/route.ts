import { NextResponse } from "next/server";
import { z } from "zod";

import { formatRecurrenceLabel } from "@/lib/recurrence/labels";
import { isoWeekdayFromYmd } from "@/lib/recurrence/dateYmd";
import { RecurrenceRuleSchema, RecurrenceFrequencySchema } from "@/lib/recurrence/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  type: z.enum(["todo", "followup", "reminder"]),
  assigned_to: z.string().trim().min(1).max(120).optional(),
  first_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  recurrence: z.object({
    frequency: RecurrenceFrequencySchema,
    by_weekday: z.number().int().min(1).max(7).optional(),
    by_month_day: z.number().int().min(1).max(31).optional(),
  }),
  reminder: z.union([
    z.object({ enabled: z.literal(false) }),
    z.object({ enabled: z.literal(true), time: z.string().regex(/^\d{2}:\d{2}$/) }),
    z.object({ enabled: z.literal(true), time: z.null() }),
  ]),
});

function buildRule(
  input: z.infer<typeof CreateSchema>["recurrence"],
  firstDueYmd: string,
): z.infer<typeof RecurrenceRuleSchema> {
  const dayOfMonth = Number(firstDueYmd.split("-")[2]) || 1;
  if (input.frequency === "weekly") {
    return RecurrenceRuleSchema.parse({
      frequency: "weekly",
      by_weekday: input.by_weekday ?? isoWeekdayFromYmd(firstDueYmd),
    });
  }
  if (
    input.frequency === "monthly" ||
    input.frequency === "quarterly" ||
    input.frequency === "half_yearly" ||
    input.frequency === "yearly"
  ) {
    return RecurrenceRuleSchema.parse({
      frequency: input.frequency,
      by_month_day: input.by_month_day ?? dayOfMonth,
    });
  }
  return RecurrenceRuleSchema.parse({ frequency: "daily" });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const assignedTo = body.assigned_to?.trim() || "self";
  const dueTime = body.due_time ?? "09:00";

  let reminderEnabled = false;
  let reminderTime: string | null = null;
  let reminderSetupStatus: "pending" | "complete" | "skipped" = "skipped";

  if (body.reminder.enabled === false) {
    reminderSetupStatus = "skipped";
  } else if (body.reminder.time) {
    reminderEnabled = true;
    reminderTime = body.reminder.time;
    reminderSetupStatus = "complete";
  } else {
    reminderEnabled = true;
    reminderSetupStatus = "pending";
    reminderTime = null;
  }

  const rule = buildRule(body.recurrence, body.first_due_date);
  const ruleCheck = RecurrenceRuleSchema.safeParse(rule);
  if (!ruleCheck.success) {
    return NextResponse.json({ error: "Invalid recurrence rule" }, { status: 400 });
  }

  const effectiveDueTime =
    reminderSetupStatus === "complete" && reminderTime ? reminderTime : dueTime;

  const label = formatRecurrenceLabel(ruleCheck.data);

  const { data: series, error: sErr } = await supabase
    .from("task_recurrence_series")
    .insert({
      user_id: user.id,
      title: body.title,
      description: body.description ?? null,
      type: body.type,
      assigned_to: assignedTo,
      recurrence_rule: ruleCheck.data,
      anchor_due_date: body.first_due_date,
      status: "active",
      reminder_enabled: reminderEnabled,
      reminder_time: reminderTime,
      reminder_setup_status: reminderSetupStatus,
    })
    .select("*")
    .single();

  if (sErr || !series) {
    return NextResponse.json({ error: sErr?.message ?? "Failed to create series" }, { status: 500 });
  }

  const { data: task, error: tErr } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: body.title,
      description: body.description ?? null,
      due_date: body.first_due_date,
      due_time: effectiveDueTime.slice(0, 5),
      type: body.type,
      assigned_to: assignedTo,
      status: "pending",
      completed_at: null,
      source: "recurring",
      series_id: series.id,
      recurrence_label: label,
    })
    .select("*")
    .single();

  if (tErr || !task) {
    await supabase.from("task_recurrence_series").delete().eq("id", series.id);
    return NextResponse.json({ error: tErr?.message ?? "Failed to create task" }, { status: 500 });
  }

  return NextResponse.json({ series, task });
}
