import { NextResponse } from "next/server";

import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";

export const dynamic = "force-dynamic";

const BUCKET = "avatars";
const OBJECT_PATH = (userId: string) => `${userId}/avatar.jpg`;
const MAX_BYTES = 5 * 1024 * 1024;

/** Same storage path and profile update as `POST /api/user/avatar`, but `Authorization: Bearer` (mobile). */
function sniffImageMime(buf: Uint8Array): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "image/webp";
  return null;
}

function normalizeUploadContentType(declared: string, buf: Uint8Array): string | null {
  const d = declared.split(";")[0]?.trim().toLowerCase() ?? "";
  if (d === "image/jpg") return "image/jpeg";
  if (d === "image/jpeg" || d === "image/png" || d === "image/webp" || d === "image/heic" || d === "image/heif") return d;
  if (d.startsWith("image/")) return d;
  return sniffImageMime(buf);
}

function isIsoBmffHeicFamily(buf: Uint8Array): boolean {
  if (buf.length < 12) return false;
  // ISO BMFF: size (4) + "ftyp" (4) + major brand (4)
  if (buf[4] !== 0x66 || buf[5] !== 0x74 || buf[6] !== 0x79 || buf[7] !== 0x70) return false;
  const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]).toLowerCase();
  return brand === "heic" || brand === "heix" || brand === "hevc" || brand === "hevx" || brand === "mif1" || brand === "msf1";
}

export async function POST(req: Request) {
  try {
    const auth = supabaseFromBearer(req);
    if (!auth) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
    }
    const {
      data: { user },
      error: userErr,
    } = await auth.auth.getUser();

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

    const buf = Buffer.from(await file.arrayBuffer());
    const u8 = new Uint8Array(buf);
    let contentType = normalizeUploadContentType(file.type || "", u8);
    if (!contentType && isIsoBmffHeicFamily(u8)) contentType = "image/heic";
    if (!contentType || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Expected an image file" }, { status: 400 });
    }

    const path = OBJECT_PATH(user.id);

    const { error: upErr } = await auth.storage.from(BUCKET).upload(path, buf, {
      contentType,
      upsert: true,
    });

    if (upErr) {
      console.error("[mobile/user/avatar POST] upload", upErr);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = auth.storage.from(BUCKET).getPublicUrl(path);

    const avatar_url = `${publicUrl}?v=${Date.now()}`;

    const { error: dbErr } = await auth.from("profiles").update({ avatar_url }).eq("id", user.id);
    if (dbErr) {
      console.error("[mobile/user/avatar POST] profile", dbErr);
      return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
    }

    return NextResponse.json({ avatar_url });
  } catch (e) {
    console.error("[mobile/user/avatar POST]", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = supabaseFromBearer(req);
    if (!auth) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
    }
    const {
      data: { user },
      error: userErr,
    } = await auth.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const path = OBJECT_PATH(user.id);
    await auth.storage.from(BUCKET).remove([path]);

    const { error: dbErr } = await auth.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    if (dbErr) {
      console.error("[mobile/user/avatar DELETE] profile", dbErr);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[mobile/user/avatar DELETE]", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
