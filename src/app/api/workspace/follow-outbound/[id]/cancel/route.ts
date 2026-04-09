import { NextResponse } from "next/server";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  const { data: row } = await supabase
    .from("follow_outbound_log")
    .select("id,status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "pending_approval") {
    return NextResponse.json({ error: "Not pending" }, { status: 400 });
  }

  const { error } = await supabase
    .from("follow_outbound_log")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
