import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PutSchema = z.object({
  automation_enabled: z.boolean().optional(),
  reply_parse_enabled: z.boolean().optional(),
  send_mode: z.enum(["manual_review", "auto_send"]).optional(),
  max_nudges_per_day: z.number().int().min(1).max(500).optional(),
  max_nudges_per_task: z.number().int().min(1).max(100).optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  default_response_hours: z.number().min(0.25).max(720).optional(),
  reminder_interval_minutes: z.number().int().min(5).max(10080).optional(),
  from_connected_account_id: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  const { data, error } = await supabase.from("workspace_follow_settings").select("*").eq("user_id", user.id).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    settings: data ?? {
      user_id: user.id,
      automation_enabled: false,
      reply_parse_enabled: true,
      send_mode: "manual_review",
      max_nudges_per_day: 20,
      max_nudges_per_task: 12,
      quiet_hours_start: null,
      quiet_hours_end: null,
      default_response_hours: 2,
      reminder_interval_minutes: 120,
      from_connected_account_id: null,
    },
  });
}

export async function PUT(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  const json = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const patch = parsed.data;
  if (patch.from_connected_account_id) {
    const { data: acc } = await supabase
      .from("user_connected_accounts")
      .select("id,provider")
      .eq("user_id", user.id)
      .eq("id", patch.from_connected_account_id)
      .maybeSingle();
    if (!acc || acc.provider !== "google") {
      return NextResponse.json(
        { error: "from_connected_account_id must be a Google account you connected." },
        { status: 400 },
      );
    }
  }

  const { data: existing } = await supabase
    .from("workspace_follow_settings")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const row = {
    user_id: user.id,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = existing
    ? await supabase.from("workspace_follow_settings").update(row).eq("user_id", user.id).select("*").single()
    : await supabase.from("workspace_follow_settings").insert(row).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
