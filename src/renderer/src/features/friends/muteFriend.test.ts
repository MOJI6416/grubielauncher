import { describe, expect, it } from "vitest";
import { mutedFriendIds, toggleMutedFriend } from "./muteFriend";

describe("mutedFriendIds", () => {
  it("collects only muted entries", () => {
    const muted = mutedFriendIds([
      { id: "friend-1", isMuted: true },
      { id: "friend-2", isMuted: false },
      { id: "friend-3", isMuted: true },
    ]);

    expect([...muted]).toEqual(["friend-1", "friend-3"]);
  });

  it("survives a missing list", () => {
    expect(mutedFriendIds(undefined).size).toBe(0);
  });
});

describe("toggleMutedFriend", () => {
  it("mutes a friend that has no local entry yet", () => {
    const result = toggleMutedFriend([], "friend-1");

    expect(result.isMuted).toBe(true);
    expect(result.next).toEqual([{ id: "friend-1", isMuted: true }]);
  });

  it("unmutes a friend that is muted", () => {
    const result = toggleMutedFriend(
      [
        { id: "friend-1", isMuted: true },
        { id: "friend-2", isMuted: true },
      ],
      "friend-1",
    );

    expect(result.isMuted).toBe(false);
    expect(result.next).toEqual([
      { id: "friend-1", isMuted: false },
      { id: "friend-2", isMuted: true },
    ]);
  });

  it("keeps the source list untouched so a failed save can be rolled back", () => {
    const friends = [{ id: "friend-1", isMuted: false }];
    const result = toggleMutedFriend(friends, "friend-1");

    expect(friends).toEqual([{ id: "friend-1", isMuted: false }]);
    expect(result.next).not.toBe(friends);
  });
});
