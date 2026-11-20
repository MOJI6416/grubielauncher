import { describe, expect, it } from "vitest";
import type { IFriend, IFriendRequest } from "@/types/IFriend";
import type { ActiveFriendShare } from "@/types/Share";
import type { IGroupInvite } from "@/types/Voice";
import type { ChatSummary } from "./chatSummary";
import { buildFriendList } from "./friendsList";
import {
  formatBadge,
  freshRequests,
  friendPlaces,
  peopleBadgeCount,
  unreadFromSummary,
} from "./peopleHub";

function makeFriend(
  id: string,
  nickname: string,
  patch: Partial<IFriend> = {},
): IFriend {
  return {
    isOnline: patch.isOnline ?? true,
    versionName: patch.versionName ?? "",
    versionCode: patch.versionCode ?? "",
    serverAddress: patch.serverAddress ?? "",
    user: {
      _id: id,
      uuid: id,
      nickname,
      platform: "discord",
      friends: [],
      image: null,
      lastActive: new Date("2026-11-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      playTime: 0,
      achievements: [],
    },
  } as IFriend;
}

function entries(
  list: IFriend[],
  shares: ActiveFriendShare[] = [],
): ReturnType<typeof buildFriendList>["entries"] {
  return buildFriendList({
    friends: list,
    shares: new Map(shares.map((share) => [share.hostUserId, share])),
    unread: {},
    muted: new Set(),
    query: "",
    filter: "all",
    sort: "name",
  }).entries;
}

function request(id: string, type: IFriendRequest["type"]): IFriendRequest {
  return {
    requestId: id,
    type,
    user: makeFriend(`u-${id}`, `n-${id}`).user,
  } as IFriendRequest;
}

function invite(id: string, createdAt: string): IGroupInvite {
  return {
    _id: id,
    group: { _id: `g-${id}`, name: `Group ${id}` },
    inviter: { _id: "x", nickname: "X" },
    createdAt,
  };
}

describe("friendPlaces", () => {
  it("puts friends on one server into one place, case and port aside", () => {
    const places = friendPlaces(
      entries([
        makeFriend("a", "Alex", {
          versionName: "Pack",
          serverAddress: "Play.Example.org",
        }),
        makeFriend("b", "Bea", {
          versionName: "Pack",
          versionCode: "ABCD-EFGH",
          serverAddress: "play.example.org:25565",
        }),
        makeFriend("c", "Cid", { versionName: "Solo" }),
        makeFriend("d", "Dan"),
      ]),
    );

    expect(places).toHaveLength(1);
    expect(places[0].kind).toBe("server");
    expect(places[0].entries.map((entry) => entry.friend.user._id)).toEqual([
      "a",
      "b",
    ]);
    expect(places[0].lead.friend.user._id).toBe("b");
  });

  it("names a shared world after its host", () => {
    const places = friendPlaces(
      entries(
        [makeFriend("h", "Host", { versionName: "Pack" })],
        [
          {
            sessionId: "s",
            hostUserId: "h",
            hostNickname: "Host",
            slug: "slug",
            visibility: "friends",
            publicAddress: "join.grubielauncher.com:25565",
            versionShareCode: "ABCD-EFGH",
            startedAt: "2026-11-20T10:00:00Z",
          },
        ],
      ),
    );

    expect(places).toEqual([
      expect.objectContaining({ kind: "sharedWorld", hostNickname: "Host" }),
    ]);
  });

  it("lists busier places first", () => {
    const places = friendPlaces(
      entries([
        makeFriend("a", "A", { versionName: "P", serverAddress: "one.org" }),
        makeFriend("b", "B", { versionName: "P", serverAddress: "two.org" }),
        makeFriend("c", "C", { versionName: "P", serverAddress: "two.org" }),
      ]),
    );

    expect(places.map((place) => place.address)).toEqual(["two.org", "one.org"]);
  });
});

describe("freshRequests", () => {
  it("keeps friend requests first, newest group invite next, and counts all", () => {
    const result = freshRequests(
      [request("1", "recipient"), request("2", "recipient")],
      [invite("old", "2026-11-01T00:00:00Z"), invite("new", "2026-11-19T00:00:00Z")],
      3,
    );

    expect(result.total).toBe(4);
    expect(result.items.map((item) => item.key)).toEqual([
      "friend:2",
      "friend:1",
      "group:new",
    ]);
  });

  it("returns nothing for a zero limit", () => {
    expect(freshRequests([request("1", "recipient")], [], 0).items).toEqual([]);
  });
});

describe("peopleBadgeCount", () => {
  it("adds unread chats, unmuted groups and requests", () => {
    expect(
      peopleBadgeCount({
        unread: { a: 2, b: 1 },
        groupUnreads: { loud: 3, quiet: 7 },
        mutedGroups: ["quiet"],
        incomingRequests: 1,
        groupInvites: 2,
      }),
    ).toBe(9);
  });

  it("caps the label at 99+", () => {
    expect(formatBadge(5)).toBe("5");
    expect(formatBadge(100)).toBe("99+");
  });
});

describe("unreadFromSummary", () => {
  const summary = (peerId: string, unread: number): ChatSummary => ({
    peerId,
    unread,
    lastSeq: 1,
    lastReadSeq: 0,
    peerReadSeq: 0,
    peerReadAt: null,
    lastMessage: null,
  });

  it("takes the server count for every chat it names", () => {
    expect(
      unreadFromSummary([summary("a", 4), summary("b", 0)], { a: 1, b: 2 }),
    ).toEqual({ a: 4 });
  });
});
