import { describe, expect, it } from "vitest";
import { parseRoomProposal } from "./drafts.js";

describe("room proposal boundary", () => {
  it("strictly parses review operations", () => {
    expect(parseRoomProposal({ operations: [{ op: "dimension", field: "widthMm", value: 3200 }] })).not.toBeNull();
    expect(parseRoomProposal({ operations: [{ op: "dimension", field: "__proto__", value: 3200 }] })).toBeNull();
    expect(parseRoomProposal({ operations: [{ op: "dimension", field: "widthMm", value: "3200" }] })).toBeNull();
    expect(parseRoomProposal({ operations: [] })).toBeNull();
  });
});
