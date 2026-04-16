import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** List meeting parent notes and their most recent children. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: parents, error: pErr } = await supabase
    .from("notes")
    .select("id,content,created_at")
    .eq("user_id", user.id)
    .eq("type", "meeting")
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const parentIds = (parents ?? []).map((p) => p.id as string);
  let children: any[] = [];
  if (parentIds.length > 0) {
    const { data: kids, error: cErr } = await supabase
      .from("notes")
      .select("id,parent_id,content,created_at")
      .eq("user_id", user.id)
      .eq("type", "meeting_transcript")
      .in("parent_id", parentIds)
      .order("created_at", { ascending: false })
      .limit(250);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    children = kids ?? [];
  }

  return NextResponse.json({ parents: parents ?? [], children });
}

