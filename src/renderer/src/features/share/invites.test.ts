import { describe, expect, it } from "vitest";
import type { IFriend } from "@/types/IFriend";
import type { IUser } from "@/types/IUser";
import {
  buildInviteCandidates,
  countInvitable,
  matchesInviteQuery,
} from "./invites";

function friend(
  id: string,
  nickname: string,
  patch: Partial<IFriend> = {},
): IFriend {
  return {
    user: { _id: id, nickname, image: null } as unknown as IUser,
    isOnline: true,
    versionName: "",
    versionCode: "",
    serverAddress: "",
    ...patch,
  };
}

const base = {
  joinedUserIds: new Set<string>(),
  sentIds: new Set<string>(),
  sendingIds: new Set<string>(),
  query: "",
};

describe("buildInviteCandidates", () => {
  it("puts actionable friends first and offline ones last", () => {
    const candidates = buildInviteCandidates({
      ...base,
      friends: [
        friend("1", "Zoe"),
        friend("2", "Adam", { isOnline: false }),
        friend("3", "Bob"),
      ],
    });

    expect(candidates.map((c) => c.nickname)).toEqual(["Bob", "Zoe", "Adam"]);
    expect(candidates[2].state).toBe("offline");
  });

  it("marks guests that already joined the world", () => {
    const candidates = buildInviteCandidates({
      ...base,
      friends: [friend("1", "Kituk")],
      joinedUserIds: new Set(["1"]),
    });

    expect(candidates[0].state).toBe("joined");
  });

  it("marks a pending send above an already sent invite", () => {
    const candidates = buildInviteCandidates({
      ...base,
      friends: [friend("1", "Aa"), friend("2", "Bb")],
      sendingIds: new Set(["2"]),
      sentIds: new Set(["1"]),
    });

    expect(candidates.map((c) => c.state)).toEqual(["sending", "sent"]);
  });

  it("keeps an invite in flight in its place among ready friends", () => {
    const candidates = buildInviteCandidates({
      ...base,
      friends: [friend("1", "Aa"), friend("2", "Bb"), friend("3", "Cc")],
      sendingIds: new Set(["2"]),
    });

    expect(candidates.map((c) => c.nickname)).toEqual(["Aa", "Bb", "Cc"]);
    expect(candidates[1].state).toBe("sending");
  });

  it("prefers joined over sent for the same friend", () => {
    const candidates = buildInviteCandidates({
      ...base,
      friends: [friend("1", "Kituk")],
      joinedUserIds: new Set(["1"]),
      sentIds: new Set(["1"]),
    });

    expect(candidates[0].state).toBe("joined");
  });

  it("filters by query", () => {
    const candidates = buildInviteCandidates({
      ...base,
      friends: [friend("1", "moji6416"), friend("2", "Kituk")],
      query: "kit",
    });

    expect(candidates.map((c) => c.nickname)).toEqual(["Kituk"]);
  });

  it("shows where an online friend currently plays", () => {
    const candidates = buildInviteCandidates({
      ...base,
      friends: [
        friend("1", "A", { serverAddress: "play.example.com" }),
        friend("2", "B", { versionName: "Fabric 26.2" }),
        friend("3", "C", { isOnline: false, versionName: "Vanilla" }),
      ],
    });

    expect(candidates.map((c) => c.place)).toEqual([
      "play.example.com",
      "Fabric 26.2",
      "",
    ]);
  });

  it("skips friends without an id", () => {
    const broken = { ...friend("x", "X") } as IFriend;
    broken.user = undefined as unknown as IUser;

    expect(
      buildInviteCandidates({ ...base, friends: [broken] }),
    ).toHaveLength(0);
  });
});

describe("countInvitable", () => {
  it("counts only friends that can be invited right now", () => {
    const candidates = buildInviteCandidates({
      ...base,
      friends: [friend("1", "A"), friend("2", "B", { isOnline: false })],
    });

    expect(countInvitable(candidates)).toBe(1);
  });
});

describe("matchesInviteQuery", () => {
  it("matches everything on an empty query", () => {
    expect(matchesInviteQuery("Kituk", "  ")).toBe(true);
  });

  it("is case-insensitive and matches a substring", () => {
    expect(matchesInviteQuery("moji6416", "JI64")).toBe(true);
    expect(matchesInviteQuery("moji6416", "zzz")).toBe(false);
  });
});
