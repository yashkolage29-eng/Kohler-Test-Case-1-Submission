import { describe, expect, it } from "vitest";

import { sha256Hex } from "./hash.js";

// FIPS 180-4 known-answer vectors.
describe("sha256Hex", () => {
  it("matches FIPS 180-4 test vectors", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is deterministic and length-64 lowercase hex", () => {
    const h = sha256Hex("K-3889-0");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("K-3889-0")).toBe(h);
  });
});
