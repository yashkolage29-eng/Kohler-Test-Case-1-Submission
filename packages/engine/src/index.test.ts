import { describe, expect, it } from "vitest";

import { ENGINE_CONTRACT_VERSION } from "./index.js";

describe("@kolher/engine entry", () => {
  it("exports the shared contract version", () => {
    expect(ENGINE_CONTRACT_VERSION).toBe("0.1.0");
  });
});

