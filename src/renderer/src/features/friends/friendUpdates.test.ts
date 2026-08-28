import { describe, expect, it } from "vitest";
import type { IFriend } from "@/types/IFriend";
import { applyFriendUpdate, sortRequests } from "./friendUpdates";

function makeFriend(id: string, patch: Partial<IFriend> = {}): IFriend {
  return {
    isOnline: false,
    versionName: "",
    versionCode: "",
    serverAddress: "",
    ...patch,
    user: {
      _id: id,
      uuid: id,
      nickname: "Steve",
      platform: "discord",
      friends: [],
      image: "old.png",
      lastActive: new Date("2026-08-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      playTime: 0,
      achievements: ["a"],
      ...(patch.user ?? {}),
    },
  } as IFriend;
}

describe("applyFriendUpdate", () => {
  const friends = [makeFriend("a"), makeFriend("b")];

  it("patches presence fields of the matching friend", () => {
    const next = applyFriendUpdate(
      friends,
      makeFriend("b", {
        isOnline: true,
        versionName: "Fabric",
        versionCode: "code",
        serverAddress: "srv",
      }),
    );

    expect(next[1].isOnline).toBe(true);
    expect(next[1].versionName).toBe("Fabric");
    expect(next[0].isOnline).toBe(false);
  });

  it("keeps fields the presence payload does not carry", () => {
    const next = applyFriendUpdate(friends, makeFriend("a", { isOnline: true }));
    expect(next[0].user.achievements).toEqual(["a"]);
  });

  it("moves last-active forward but never backwards", () => {
    const forward = applyFriendUpdate(
      friends,
      makeFriend("a", {
        user: { lastActive: new Date("2026-08-15T00:00:00Z") } as never,
      }),
    );
    expect(new Date(forward[0].user.lastActive).toISOString()).toBe(
      "2026-08-15T00:00:00.000Z",
    );

    const backward = applyFriendUpdate(
      forward,
      makeFriend("a", {
        user: { lastActive: new Date("2026-07-01T00:00:00Z") } as never,
      }),
    );
    expect(new Date(backward[0].user.lastActive).toISOString()).toBe(
      "2026-08-15T00:00:00.000Z",
    );
  });

  it("stamps last-active when a friend goes offline without a timestamp", () => {
    const online = applyFriendUpdate(friends, makeFriend("a", { isOnline: true }));
    const now = Date.parse("2026-08-22T10:00:00Z");

    const next = applyFriendUpdate(
      online,
      {
        user: { _id: "a" },
        isOnline: false,
        versionName: "Fabric",
        versionCode: "",
        serverAddress: "",
      } as IFriend,
      now,
    );

    expect(new Date(next[0].user.lastActive).getTime()).toBe(now);
  });

  it("prefers the timestamp the payload carries over the stamp", () => {
    const online = applyFriendUpdate(friends, makeFriend("a", { isOnline: true }));
    const now = Date.parse("2026-08-22T10:00:00Z");

    const next = applyFriendUpdate(
      online,
      makeFriend("a", {
        isOnline: false,
        user: { lastActive: new Date("2026-08-22T11:00:00Z") } as never,
      }),
      now,
    );

    expect(new Date(next[0].user.lastActive).toISOString()).toBe(
      "2026-08-22T11:00:00.000Z",
    );
  });

  it("does not stamp a friend who was already offline", () => {
    const next = applyFriendUpdate(
      friends,
      {
        user: { _id: "a" },
        isOnline: false,
        versionName: "",
        versionCode: "",
        serverAddress: "",
      } as IFriend,
      Date.parse("2026-08-22T10:00:00Z"),
    );

    expect(new Date(next[0].user.lastActive).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("does not stamp a friend who stays online", () => {
    const online = applyFriendUpdate(friends, makeFriend("a", { isOnline: true }));
    const next = applyFriendUpdate(
      online,
      makeFriend("a", { isOnline: true, versionName: "Fabric" }),
      Date.parse("2026-08-22T10:00:00Z"),
    );

    expect(new Date(next[0].user.lastActive).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("ignores an update for an unknown friend", () => {
    expect(applyFriendUpdate(friends, makeFriend("zzz"))).toBe(friends);
  });

  it("ignores a payload without a user", () => {
    expect(applyFriendUpdate(friends, {} as IFriend)).toBe(friends);
  });
});

describe("sortRequests", () => {
  it("splits incoming from outgoing", () => {
    const { incoming, outgoing } = sortRequests([
      { type: "recipient" as const, id: 1 },
      { type: "requester" as const, id: 2 },
      { type: "recipient" as const, id: 3 },
    ]);

    expect(incoming.map((item) => item.id)).toEqual([1, 3]);
    expect(outgoing.map((item) => item.id)).toEqual([2]);
  });
});
