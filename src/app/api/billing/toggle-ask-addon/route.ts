import { NextResponse } from "next/server";
import { z } from "zod";

import { coerceBacupTierId } from "@/lib/billing/bacupTiers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ enabled: z.boolean() }).strict();

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: row, error: readErr } = await supabase
    .from("user_settings")
    .select("subscription_tier")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) {
    console.error("[billing/toggle-ask-addon] read", readErr);
    return NextResponse.json({ error: "Failed to read settings" }, { status: 500 });
  }

  const tier = coerceBacupTierId(row?.subscription_tier);
  if (tier === "executive_os") {
    return NextResponse.json({ error: "Ask Bacup is included in Executive OS." }, { status: 400 });
  }

  const enabled = parsed.data.enabled;
  /** Solo has no included AI pool; enabling Ask Bacup bumps quota to starter-level. Operator keeps starter. */
  const billing_plan = tier === "solo_os" ? (enabled ? "starter" : "solo") : "starter";

  const { error } = await supabase
    .from("user_settings")
    .update({
      ask_bacup_addon: enabled,
      billing_plan,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("[billing/toggle-ask-addon] update", error);
    return NextResponse.json({ error: "Failed to update add-on" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, askBacupAddon: parsed.data.enabled });
}
