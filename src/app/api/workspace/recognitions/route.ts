import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PostSchema = z.object({
  to_user_id: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
  value_id: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ctx = await resolveWorkspaceContext(supabase, user.id);
    const json = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("workspace_recognitions")
      .insert({
        workspace_owner_id: ctx.workspaceOwnerId,
        from_user_id: user.id,
        to_user_id: parsed.data.to_user_id,
        message: parsed.data.message,
        value_id: parsed.data.value_id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ id: data?.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
