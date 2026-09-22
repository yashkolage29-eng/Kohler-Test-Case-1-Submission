import { describe, expect, it } from "vitest";
import { MAX_PHOTO_FILE_BYTES, MAX_SENT_DATA_URL_CHARS, fitWithin, photoSizeError } from "./photo.js";

describe("T-038 photo limits", () => {
  it("accepts files up to 10 MB and refuses larger ones", () => {
    expect(photoSizeError(9 * 1024 * 1024)).toBeUndefined();
    expect(photoSizeError(MAX_PHOTO_FILE_BYTES)).toBeUndefined();
    expect(photoSizeError(MAX_PHOTO_FILE_BYTES + 1)).toContain("10 MB");
  });

  it("keeps the sent photo under the server's 1,000,000-character limit", () => {
    expect(MAX_SENT_DATA_URL_CHARS).toBeLessThan(1_000_000);
  });

  it("scales the long side down to the limit without upscaling", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 });
  });
});
