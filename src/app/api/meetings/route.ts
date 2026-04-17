import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

type NoteRow = { id: string; content: string; created_at: string };
type ChildRow = { id: string; parent_id: string; content: string; created_at: string };

/** List meeting parent notes and their most recent children, or search all transcripts / titles. */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const rawSearch = url.searchParams.get("search")?.trim() ?? "";

  if (rawSearch.length >= 2) {
    const pattern = `%${escapeIlikePattern(rawSearch)}%`;

    const [transRes, titleRes] = await Promise.all([
      supabase
        .from("notes")
        .select("id,parent_id,content,created_at")
        .eq("user_id", user.id)
        .eq("type", "meeting_transcript")
        .ilike("content", pattern)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("notes")
        .select("id,content,created_at")
        .eq("user_id", user.id)
        .eq("type", "meeting")
        .is("parent_id", null)
        .ilike("content", pattern)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    if (transRes.error) return NextResponse.json({ error: transRes.error.message }, { status: 500 });
    if (titleRes.error) return NextResponse.json({ error: titleRes.error.message }, { status: 500 });

    const byContent = (transRes.data ?? []) as ChildRow[];
    const titleMatches = (titleRes.data ?? []) as NoteRow[];
    const titledParentIds = titleMatches.map((p) => p.id);

    let byTitle: ChildRow[] = [];
    if (titledParentIds.length > 0) {
      const { data: kids, error: kErr } = await supabase
        .from("notes")
        .select("id,parent_id,content,created_at")
        .eq("user_id", user.id)
        .eq("type", "meeting_transcript")
        .in("parent_id", titledParentIds)
        .order("created_at", { ascending: false })
        .limit(250);
      if (kErr) return NextResponse.json({ error: kErr.message }, { status: 500 });
      byTitle = (kids ?? []) as ChildRow[];
    }

    const childById = new Map<string, ChildRow>();
    for (const c of byContent) childById.set(c.id, c);
    for (const c of byTitle) childById.set(c.id, c);
    const mergedChildren = [...childById.values()].sort((a, b) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    );

    const parentIdSet = new Set<string>();
    for (const c of mergedChildren) {
      if (c.parent_id) parentIdSet.add(c.parent_id);
    }
    for (const p of titleMatches) parentIdSet.add(p.id);

    const parentIds = [...parentIdSet];
    let parentRows: NoteRow[] = [];
    if (parentIds.length > 0) {
      const { data: prow, error: pErr } = await supabase
        .from("notes")
        .select("id,content,created_at")
        .eq("user_id", user.id)
        .eq("type", "meeting")
        .is("parent_id", null)
        .in("id", parentIds);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
      parentRows = (prow ?? []) as NoteRow[];
    }

    for (const p of titleMatches) {
      if (!parentRows.some((r) => r.id === p.id)) parentRows.push(p);
    }

    return NextResponse.json({
      parents: parentRows,
      children: mergedChildren,
      mode: "search" as const,
    });
  }

  const { data: parents, error: pErr } = await supabase
    .from("notes")
    .select("id,content,created_at")
    .eq("user_id", user.id)
    .eq("type", "meeting")
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(80);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const parentIds = (parents ?? []).map((p) => p.id as string);
  let children: ChildRow[] = [];
  if (parentIds.length > 0) {
    const { data: kids, error: cErr } = await supabase
      .from("notes")
      .select("id,parent_id,content,created_at")
      .eq("user_id", user.id)
      .eq("type", "meeting_transcript")
      .in("parent_id", parentIds)
      .order("created_at", { ascending: false })
      .limit(800);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    children = (kids ?? []) as ChildRow[];
  }

  return NextResponse.json({ parents: parents ?? [], children, mode: "browse" as const });
}

