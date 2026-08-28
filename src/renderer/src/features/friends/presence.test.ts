import { describe, expect, it } from "vitest";
import type { IFriend } from "@/types/IFriend";
import type { ActiveFriendShare } from "@/types/Share";
import { canJoinFriend, friendPresence } from "./presence";

function makeFriend(patch: Partial<IFriend> = {}): IFriend {
  return {
    isOnline: true,
    versionName: "",
    versionCode: "",
    serverAddress: "",
    ...patch,
    user: {
      _id: "u1",
      uuid: "uuid",
      nickname: "Steve",
      platform: "discord",
      friends: [],
      image: null,
      lastActive: new Date("2026-08-15T10:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      playTime: 0,
      achievements: [],
      ...(patch.user ?? {}),
    },
  } as IFriend;
}

function makeShare(patch: Partial<ActiveFriendShare> = {}): ActiveFriendShare {
  return {
    sessionId: "s1",
    hostUserId: "u1",
    hostNickname: "Steve",
    slug: "slug",
    visibility: "friends",
    publicAddress: "join.grubielauncher.com:25565",
    startedAt: "2026-08-15T10:00:00Z",
    ...patch,
  };
}

describe("friendPresence", () => {
  it("reports offline without any game details", () => {
    const presence = friendPresence(
      makeFriend({ isOnline: false, versionName: "Fabric", serverAddress: "a" }),
    );

    expect(presence.kind).toBe("offline");
    expect(presence.versionName).toBe("");
    expect(presence.place).toBeNull();
    expect(presence.hasJoinTarget).toBe(false);
  });

  it("keeps a last-active timestamp even when offline", () => {
    const presence = friendPresence(makeFriend({ isOnline: false }));
    expect(presence.lastActiveAt).toBe(
      new Date("2026-08-15T10:00:00Z").getTime(),
    );
  });

  it("survives an unparsable last-active value", () => {
    const friend = makeFriend();
    (friend.user as { lastActive: unknown }).lastActive = "nonsense";
    expect(friendPresence(friend).lastActiveAt).toBe(0);
  });

  it("treats a bare online friend as online, not playing", () => {
    expect(friendPresence(makeFriend()).kind).toBe("online");
  });

  it("marks a friend on a server as playing and joinable", () => {
    const presence = friendPresence(
      makeFriend({
        versionName: "Fabric 26.2",
        versionCode: "code",
        serverAddress: "play.example.com",
      }),
    );

    expect(presence.kind).toBe("playing");
    expect(presence.place).toEqual({
      kind: "server",
      address: "play.example.com",
    });
    expect(presence.hasJoinTarget).toBe(true);
  });

  it("prefers the share version code over the presence one", () => {
    const presence = friendPresence(
      makeFriend({ versionName: "Fabric", versionCode: "stale" }),
      makeShare({ versionShareCode: "fresh" }),
    );

    expect(presence.joinVersionCode).toBe("fresh");
    expect(presence.place).toEqual({ kind: "sharedWorld" });
  });

  it("shows a raw address for a share outside the launcher gateway", () => {
    const presence = friendPresence(
      makeFriend({ versionName: "Fabric" }),
      makeShare({ publicAddress: "1.2.3.4:25565", versionShareCode: "code" }),
    );

    expect(presence.place).toEqual({ kind: "world", address: "1.2.3.4:25565" });
  });

  it("is playing but not joinable without a published build", () => {
    const presence = friendPresence(
      makeFriend({ versionName: "Fabric", serverAddress: "play.example.com" }),
    );

    expect(presence.kind).toBe("playing");
    expect(presence.hasJoinTarget).toBe(false);
  });
});

describe("canJoinFriend", () => {
  const joinable = friendPresence(
    makeFriend({
      versionName: "Fabric",
      versionCode: "code",
      serverAddress: "play.example.com",
    }),
  );

  it("allows joining when nothing is running locally", () => {
    expect(canJoinFriend(joinable, false)).toBe(true);
  });

  it("blocks joining while a game is already running", () => {
    expect(canJoinFriend(joinable, true)).toBe(false);
  });

  it("blocks joining an idle friend", () => {
    expect(canJoinFriend(friendPresence(makeFriend()), false)).toBe(false);
  });
});
