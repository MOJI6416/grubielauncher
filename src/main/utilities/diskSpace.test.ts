import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { FREE_SPACE_MARGIN_BYTES, getFreeBytes, hasRoomFor } from "./diskSpace";

describe("hasRoomFor", () => {
  it("keeps a safety margin on top of what the operation needs", () => {
    expect(hasRoomFor(FREE_SPACE_MARGIN_BYTES + 100, 100)).toBe(true);
    expect(hasRoomFor(FREE_SPACE_MARGIN_BYTES + 99, 100)).toBe(false);
  });

  it("does not block an operation when free space is unknown", () => {
    expect(hasRoomFor(null, Number.MAX_SAFE_INTEGER)).toBe(true);
  });
});

describe("getFreeBytes", () => {
  it("reads the free space of an existing folder", async () => {
    const free = await getFreeBytes(os.tmpdir());
    expect(free === null || free > 0).toBe(true);
  });

  it("answers unknown for a folder that does not exist", async () => {
    expect(
      await getFreeBytes(path.join(os.tmpdir(), "grubie-missing-folder", "x")),
    ).toBeNull();
  });
});
