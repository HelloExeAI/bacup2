import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET = "avatars";
const OBJECT_PATH = (userId: string) => `${userId}/avatar.jpg`;
const MAX_BYTES = 5 * 1024 * 1024;

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

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const type = file.type || "";
    if (type !== "image/jpeg" && type !== "image/jpg") {
      return NextResponse.json({ error: "Expected image/jpeg" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const path = OBJECT_PATH(user.id);

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: "image/jpeg",
      upsert: true,
    });

    if (upErr) {
      console.error("[user/avatar POST] upload", upErr);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const avatar_url = `${publicUrl}?v=${Date.now()}`;

    const { error: dbErr } = await supabase.from("profiles").update({ avatar_url }).eq("id", user.id);
    if (dbErr) {
      console.error("[user/avatar POST] profile", dbErr);
      return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
    }

    return NextResponse.json({ avatar_url });
  } catch (e) {
    console.error("[user/avatar POST]", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const path = OBJECT_PATH(user.id);
    await supabase.storage.from(BUCKET).remove([path]);

    const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    if (dbErr) {
      console.error("[user/avatar DELETE] profile", dbErr);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[user/avatar DELETE]", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
