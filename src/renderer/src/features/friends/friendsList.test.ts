import { describe, expect, it } from "vitest";
import type { IFriend } from "@/types/IFriend";
import type { ActiveFriendShare } from "@/types/Share";
import type { ChatPreview } from "./chatSummary";
import {
  buildFriendList,
  friendRowDetail,
  nextFriendIndex,
  recentChats,
  steadyRows,
  type FriendRow,
} from "./friendsList";

function makeFriend(
  id: string,
  nickname: string,
  patch: Partial<IFriend> & { lastActive?: string } = {},
): IFriend {
  return {
    isOnline: patch.isOnline ?? false,
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
      lastActive: new Date(patch.lastActive ?? "2026-08-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      playTime: 0,
      achievements: [],
    },
  } as IFriend;
}

const base = {
  shares: new Map<string, ActiveFriendShare>(),
  unread: {} as Record<string, number>,
  muted: new Set<string>(),
  query: "",
  filter: "all" as const,
  sort: "activity" as const,
};

const friends = [
  makeFriend("offline1", "zzz", { lastActive: "2026-08-10T00:00:00Z" }),
  makeFriend("online1", "bbb", { isOnline: true }),
  makeFriend("playing1", "aaa", {
    isOnline: true,
    versionName: "Fabric 26.2",
    versionCode: "code",
    serverAddress: "play.example.com",
  }),
];

function friendKeys(rows: FriendRow[]) {
  return rows.filter((row) => row.type === "friend").map((row) => row.key);
}

describe("buildFriendList", () => {
  it("orders sections playing, online, offline", () => {
    const result = buildFriendList({ ...base, friends });
    const sections = result.rows
      .filter((row) => row.type === "section")
      .map((row) => (row.type === "section" ? row.kind : ""));

    expect(sections).toEqual(["playing", "online", "offline"]);
    expect(result.counts).toEqual({ playing: 1, online: 1, offline: 1 });
  });

  it("hides a section that has no members", () => {
    const result = buildFriendList({
      ...base,
      friends: [friends[0]],
    });

    expect(result.rows.filter((row) => row.type === "section")).toHaveLength(1);
  });

  it("counts every friend even when the query hides them", () => {
    const result = buildFriendList({ ...base, friends, query: "aaa" });

    expect(result.total).toBe(3);
    expect(result.matched).toBe(1);
    expect(result.counts.offline).toBe(1);
  });

  it("matches the query case-insensitively", () => {
    const result = buildFriendList({ ...base, friends, query: "  BB " });
    expect(friendKeys(result.rows)).toEqual(["online1"]);
  });

  it("filters to online only", () => {
    const result = buildFriendList({ ...base, friends, filter: "online" });
    expect(friendKeys(result.rows)).toEqual(["playing1", "online1"]);
  });

  it("filters to unread only", () => {
    const result = buildFriendList({
      ...base,
      friends,
      filter: "unread",
      unread: { offline1: 3 },
    });

    expect(friendKeys(result.rows)).toEqual(["offline1"]);
  });

  it("sums unread across every friend, filtered or not", () => {
    const result = buildFriendList({
      ...base,
      friends,
      filter: "online",
      unread: { offline1: 3, online1: 2 },
    });

    expect(result.unreadTotal).toBe(5);
  });

  it("keeps the order stable when an unread message arrives", () => {
    const input = {
      ...base,
      friends: [
        makeFriend("a", "aaa", { lastActive: "2026-08-14T00:00:00Z" }),
        makeFriend("b", "bbb", { lastActive: "2026-08-01T00:00:00Z" }),
      ],
    };

    expect(friendKeys(buildFriendList(input).rows)).toEqual(["a", "b"]);
    expect(
      friendKeys(buildFriendList({ ...input, unread: { b: 1 } }).rows),
    ).toEqual(["a", "b"]);
  });

  it("sorts by name when asked", () => {
    const result = buildFriendList({
      ...base,
      friends: [
        makeFriend("b", "bbb", { lastActive: "2026-08-14T00:00:00Z" }),
        makeFriend("a", "aaa", { lastActive: "2026-08-01T00:00:00Z" }),
      ],
      sort: "name",
    });

    expect(friendKeys(result.rows)).toEqual(["a", "b"]);
  });

  it("marks muted friends", () => {
    const result = buildFriendList({
      ...base,
      friends,
      muted: new Set(["online1"]),
    });

    const entry = result.entries.find(
      (item) => item.friend.user._id === "online1",
    );
    expect(entry?.isMuted).toBe(true);
  });

  it("returns an empty row list without friends", () => {
    const result = buildFriendList({ ...base, friends: [] });
    expect(result.rows).toEqual([]);
    expect(result.unreadTotal).toBe(0);
  });

  it("carries the preview and the typing flag into the row", () => {
    const preview: ChatPreview = {
      id: "m1",
      seq: 4,
      senderId: "online1",
      type: "text",
      value: "hi",
      time: "2026-08-17T10:00:00.000Z",
    };

    const result = buildFriendList({
      ...base,
      friends,
      previews: { online1: preview },
      typing: new Set(["offline1"]),
    });

    const online = result.entries.find(
      (entry) => entry.friend.user._id === "online1",
    );
    const offline = result.entries.find(
      (entry) => entry.friend.user._id === "offline1",
    );

    expect(online?.preview).toBe(preview);
    expect(online?.isTyping).toBe(false);
    expect(offline?.isTyping).toBe(true);
    expect(offline?.preview).toBeUndefined();
  });
});

describe("friendRowDetail", () => {
  const preview: ChatPreview = {
    id: "m1",
    seq: 4,
    senderId: "peer",
    type: "text",
    value: "hi",
    time: "2026-08-17T10:00:00.000Z",
  };

  it("puts typing above everything else", () => {
    expect(
      friendRowDetail({
        isTyping: true,
        preview,
        presence: { kind: "playing" },
      }),
    ).toBe("typing");
  });

  it("shows the last message for an idle friend", () => {
    expect(
      friendRowDetail({ isTyping: false, preview, presence: { kind: "online" } }),
    ).toBe("preview");
  });

  it("keeps presence while the friend is in game", () => {
    expect(
      friendRowDetail({
        isTyping: false,
        preview,
        presence: { kind: "playing" },
      }),
    ).toBe("presence");
  });

  it("falls back to presence without a conversation", () => {
    expect(
      friendRowDetail({ isTyping: false, presence: { kind: "offline" } }),
    ).toBe("presence");
  });
});

describe("nextFriendIndex", () => {
  const rows = buildFriendList({ ...base, friends }).rows;

  it("starts at the first friend when nothing is selected", () => {
    expect(nextFriendIndex(rows, undefined, 1)).toBe("playing1");
  });

  it("starts at the last friend when stepping backwards from nothing", () => {
    expect(nextFriendIndex(rows, undefined, -1)).toBe("offline1");
  });

  it("skips section headers", () => {
    expect(nextFriendIndex(rows, "playing1", 1)).toBe("online1");
  });

  it("stops at the edges", () => {
    expect(nextFriendIndex(rows, "offline1", 1)).toBe("offline1");
    expect(nextFriendIndex(rows, "playing1", -1)).toBe("playing1");
  });

  it("has nothing to move to in an empty list", () => {
    expect(nextFriendIndex([], "x", 1)).toBeUndefined();
  });
});

describe("recentChats", () => {
  const preview = (senderId: string, time: string | null): ChatPreview => ({
    id: `m-${senderId}-${time}`,
    seq: 1,
    senderId,
    type: "text",
    value: "hi",
    time,
  });

  const chatFriends = [
    makeFriend("silent", "silent"),
    makeFriend("older", "older"),
    makeFriend("newer", "newer"),
    makeFriend("unreadOnly", "unreadOnly"),
    makeFriend("busy", "busy", {
      isOnline: true,
      versionName: "Fabric 26.2",
      versionCode: "code",
    }),
  ];

  const build = (patch: Partial<typeof base> = {}) =>
    buildFriendList({
      ...base,
      ...patch,
      friends: chatFriends,
      previews: {
        older: preview("older", "2026-08-01T10:00:00.000Z"),
        newer: preview("newer", "2026-08-19T10:00:00.000Z"),
        busy: preview("busy", "2026-08-20T10:00:00.000Z"),
      },
      unread: { unreadOnly: 2 },
    }).entries;

  const ids = (entries: ReturnType<typeof build>) =>
    entries.map((entry) => entry.friend.user._id);

  it("keeps only friends with a conversation", () => {
    expect(ids(recentChats(build(), 8))).not.toContain("silent");
  });

  it("counts an unread friend even without a preview", () => {
    expect(ids(recentChats(build(), 8))).toContain("unreadOnly");
  });

  it("puts the newest message first", () => {
    const result = ids(recentChats(build(), 8));
    expect(result.indexOf("newer")).toBeLessThan(result.indexOf("older"));
  });

  it("leaves friends who are in game to the playing block", () => {
    expect(ids(recentChats(build(), 8))).not.toContain("busy");
  });

  it("honours the limit", () => {
    expect(recentChats(build(), 1)).toHaveLength(1);
    expect(recentChats(build(), 0)).toHaveLength(0);
  });

  it("survives a preview without a usable time", () => {
    const entries = buildFriendList({
      ...base,
      friends: [makeFriend("a", "aaa")],
      previews: { a: preview("a", null) },
    }).entries;

    expect(ids(recentChats(entries, 8))).toEqual(["a"]);
  });
});

describe("steadyRows", () => {
  const build = (input: {
    friends: IFriend[];
  }): FriendRow[] => buildFriendList({ ...base, friends: input.friends }).rows;

  const shape = (rows: FriendRow[]) =>
    rows.map((row) =>
      row.type === "section" ? `#${row.kind}:${row.count}` : row.key,
    );

  it("returns the fresh rows when nothing was frozen", () => {
    const rows = build({ friends: [makeFriend("a", "aaa", { isOnline: true })] });
    expect(steadyRows([], rows)).toBe(rows);
  });

  it("moves a friend to the section that matches their state", () => {
    const frozen = build({
      friends: [
        makeFriend("a", "aaa", { isOnline: true }),
        makeFriend("b", "bbb", { isOnline: true }),
      ],
    });
    const rows = build({
      friends: [
        makeFriend("a", "aaa", { isOnline: true, versionName: "Cobblemon" }),
        makeFriend("b", "bbb", { isOnline: true }),
      ],
    });

    expect(shape(rows)).toEqual(["#playing:1", "a", "#online:1", "b"]);
    expect(shape(steadyRows(frozen, rows))).toEqual([
      "#playing:1",
      "a",
      "#online:1",
      "b",
    ]);
  });

  it("never leaves a section header without rows", () => {
    const frozen = build({
      friends: [makeFriend("a", "aaa", { isOnline: true })],
    });
    const rows = build({
      friends: [makeFriend("a", "aaa", { isOnline: false })],
    });

    expect(shape(steadyRows(frozen, rows))).toEqual(["#offline:1", "a"]);
  });

  it("holds the frozen order inside a section", () => {
    const frozen = build({
      friends: [
        makeFriend("a", "aaa", { isOnline: true, lastActive: "2026-08-02" }),
        makeFriend("b", "bbb", { isOnline: true, lastActive: "2026-08-01" }),
      ],
    });
    const rows = build({
      friends: [
        makeFriend("a", "aaa", { isOnline: true, lastActive: "2026-08-01" }),
        makeFriend("b", "bbb", { isOnline: true, lastActive: "2026-08-03" }),
      ],
    });

    expect(shape(rows)).toEqual(["#online:2", "b", "a"]);
    expect(shape(steadyRows(frozen, rows))).toEqual(["#online:2", "a", "b"]);
  });

  it("keeps a friend that moved sections in the frozen order of the new one", () => {
    const frozen = build({
      friends: [
        makeFriend("a", "aaa", { isOnline: true, versionName: "Cobblemon" }),
        makeFriend("b", "bbb", { isOnline: true }),
      ],
    });
    const rows = build({
      friends: [
        makeFriend("a", "aaa", { isOnline: true, versionName: "Cobblemon" }),
        makeFriend("b", "bbb", { isOnline: true, versionName: "Prominence" }),
      ],
    });

    expect(shape(steadyRows(frozen, rows))).toEqual(["#playing:2", "a", "b"]);
  });

  it("drops friends that disappeared and keeps the counts honest", () => {
    const frozen = build({
      friends: [
        makeFriend("a", "aaa", { isOnline: true }),
        makeFriend("b", "bbb", { isOnline: true }),
      ],
    });
    const rows = build({ friends: [makeFriend("a", "aaa", { isOnline: true })] });

    expect(shape(steadyRows(frozen, rows))).toEqual(["#online:1", "a"]);
  });

  it("appends friends that arrived while frozen", () => {
    const frozen = build({
      friends: [makeFriend("a", "aaa", { isOnline: true })],
    });
    const rows = build({
      friends: [
        makeFriend("a", "aaa", { isOnline: true }),
        makeFriend("c", "ccc", { isOnline: true }),
      ],
    });

    expect(shape(steadyRows(frozen, rows))).toEqual(["#online:2", "a", "c"]);
  });
});
