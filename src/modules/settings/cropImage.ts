import type { Area } from "react-easy-crop";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error("Image failed to load")));
    img.src = src;
  });
}

/** Renders the cropped region into a square JPEG blob (broad `canvas.toBlob` support). */
export async function getCroppedAvatarBlob(
  imageSrc: string,
  pixelCrop: Area,
  outputSize = 512,
  quality = 0.92,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return new Promise((resolve, reject) => {
    const finish = (blob: Blob | null) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode image"));
    };
    canvas.toBlob((b) => finish(b), "image/jpeg", quality);
  });
}
