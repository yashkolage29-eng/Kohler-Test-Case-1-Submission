// T-038 photo uploads: accept up to 10 MB, then shrink in the browser before sending so
// the request stays under the server's photo limit (MAX_PHOTO_DATA_URL_CHARS = 1,000,000
// in packages/server/src/ai/validate.ts). The vision model does not need full resolution.

export const MAX_PHOTO_FILE_BYTES = 10 * 1024 * 1024;
/** Headroom under the server's 1,000,000-character data URL cap and 1,000,000-byte request
 *  body cap (MAX_BODY_BYTES, packages/server/src/http.ts), which also carries the room JSON. */
export const MAX_SENT_DATA_URL_CHARS = 900_000;
const LONG_SIDES_PX = [1600, 1280, 1024, 800];
const JPEG_QUALITIES = [0.85, 0.7];

/** User-facing refusal for an oversized file, or undefined when it is accepted. */
export function photoSizeError(bytes: number): string | undefined {
  return bytes > MAX_PHOTO_FILE_BYTES ? "That image is larger than 10 MB. Choose a smaller photo." : undefined;
}

/** Scale (w, h) so the longer side is at most `maxSide`, never upscaling. */
export function fitWithin(w: number, h: number, maxSide: number): { w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Decode and re-encode as JPEG, stepping size/quality down until the data URL fits.
 *  Returns null when the image cannot be decoded or never fits. */
export async function downscalePhoto(file: Blob): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    for (const side of LONG_SIDES_PX) {
      const { w, h } = fitWithin(bitmap.width, bitmap.height, side);
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = "#ffffff"; // PNG transparency → white, not black, in JPEG
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (const quality of JPEG_QUALITIES) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length <= MAX_SENT_DATA_URL_CHARS) return dataUrl;
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}
