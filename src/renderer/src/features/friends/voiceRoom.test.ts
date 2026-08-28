import { describe, expect, it } from "vitest";
import { dmRoomId, isDmRoomWith } from "./voiceRoom";

describe("dmRoomId", () => {
  it("does not depend on the order of the participants", () => {
    expect(dmRoomId("b", "a")).toBe(dmRoomId("a", "b"));
    expect(dmRoomId("a", "b")).toBe("dm_a_b");
  });
});

describe("isDmRoomWith", () => {
  it("recognises the room of the current pair", () => {
    expect(isDmRoomWith("dm_a_b", "b", "a")).toBe(true);
  });

  it("rejects another room", () => {
    expect(isDmRoomWith("dm_a_c", "a", "b")).toBe(false);
  });

  it("is false without a room or a participant", () => {
    expect(isDmRoomWith(undefined, "a", "b")).toBe(false);
    expect(isDmRoomWith("dm_a_b", undefined, "b")).toBe(false);
    expect(isDmRoomWith("dm_a_b", "a", undefined)).toBe(false);
  });
});
