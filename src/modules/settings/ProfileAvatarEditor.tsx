"use client";

import * as React from "react";
import Cropper, { type Area } from "react-easy-crop";

import { Button } from "@/components/ui/button";
import { useUserStore } from "@/store/userStore";

import { getCroppedAvatarBlob } from "./cropImage";

type Props = {
  avatarUrl: string;
  onAvatarUrlChange: (url: string) => void;
};

export function ProfileAvatarEditor({ avatarUrl, onAvatarUrlChange }: Props) {
  const patchProfile = useUserStore((s) => s.patchProfile);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const onCropComplete = React.useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const revokeSrc = React.useCallback(() => {
    if (imageSrc?.startsWith("blob:")) URL.revokeObjectURL(imageSrc);
  }, [imageSrc]);

  React.useEffect(() => {
    return () => revokeSrc();
  }, [revokeSrc]);

  const openFile = () => fileRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Choose an image file");
      return;
    }
    setError(null);
    revokeSrc();
    const url = URL.createObjectURL(f);
    setImageSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropOpen(true);
  };

  const closeCrop = () => {
    setCropOpen(false);
    revokeSrc();
    setImageSrc(null);
    setCroppedAreaPixels(null);
  };

  const saveCrop = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await getCroppedAvatarBlob(imageSrc, croppedAreaPixels);
      const fd = new FormData();
      fd.append("file", blob, "avatar.jpg");
      const res = await fetch("/api/user/avatar", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Upload failed");
      const next = String(j.avatar_url || "");
      if (!next) throw new Error("No URL returned");
      onAvatarUrlChange(next);
      patchProfile({ avatar_url: next });
      closeCrop();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/user/avatar", { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Remove failed");
      onAvatarUrlChange("");
      patchProfile({ avatar_url: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        onChange={onFileChange}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              No photo
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={openFile}>
            Upload &amp; adjust
          </Button>
          {avatarUrl ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void removePhoto()}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {cropOpen && imageSrc ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Adjust profile photo"
        >
          <div className="flex max-h-[min(90vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">Position and zoom</div>
            <div className="relative aspect-square w-full bg-black">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="space-y-3 border-t border-border px-4 py-3">
              <label className="flex items-center gap-3 text-sm">
                <span className="w-14 shrink-0 text-muted-foreground">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="min-w-0 flex-1"
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" disabled={busy} onClick={closeCrop}>
                  Cancel
                </Button>
                <Button type="button" disabled={busy || !croppedAreaPixels} onClick={() => void saveCrop()}>
                  {busy ? "Saving…" : "Save photo"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
