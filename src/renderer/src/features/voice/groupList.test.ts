import { describe, expect, it } from "vitest";
import type { IGroup } from "@/types/Voice";
import {
  buildGroupList,
  filterGroupList,
  groupInitials,
  sortGroupMembers,
} from "./groupList";

function group(patch: Partial<IGroup> & { _id: string }): IGroup {
  return {
    name: patch._id,
    code: "CODE01",
    owner: { _id: "me", nickname: "me" },
    members: [{ _id: "me", nickname: "me" }],
    banned: [],
    isOwner: true,
    participantCount: 0,
    ...patch,
  };
}

describe("groupInitials", () => {
  it("uses the first letters of the first two words", () => {
    expect(groupInitials("Моя группа")).toBe("МГ");
    expect(groupInitials("Survival")).toBe("SU");
    expect(groupInitials("   ")).toBe("?");
  });
});

describe("buildGroupList", () => {
  const groups = [
    group({ _id: "quiet", name: "Quiet" }),
    group({ _id: "loud", name: "Loud", participantCount: 3 }),
    group({ _id: "unread", name: "Unread" }),
    group({ _id: "active", name: "Active", participantCount: 1 }),
  ];

  it("floats the active room, then busy voice, then unread, then name", () => {
    const entries = buildGroupList(groups, {
      activeRoomId: "active",
      unreads: { unread: 4 },
    });

    expect(entries.map((entry) => entry.group._id)).toEqual([
      "active",
      "loud",
      "unread",
      "quiet",
    ]);
  });

  it("counts voice participants from either source", () => {
    const entries = buildGroupList([
      group({ _id: "a", participantCount: 0, voiceParticipants: ["x", "y"] }),
    ]);

    expect(entries[0].voiceCount).toBe(2);
    expect(entries[0].voiceIdentities).toEqual(["x", "y"]);
  });

  it("keeps counting unread for muted groups", () => {
    const entries = buildGroupList([group({ _id: "a" })], {
      unreads: { a: 7 },
      mutedIds: ["a"],
    });

    expect(entries[0].unread).toBe(7);
    expect(entries[0].isMuted).toBe(true);
  });

  it("does not let a muted group jump the queue on unread", () => {
    const entries = buildGroupList(
      [group({ _id: "a", name: "Alpha" }), group({ _id: "b", name: "Bravo" })],
      { unreads: { b: 9 }, mutedIds: ["b"] },
    );

    expect(entries.map((entry) => entry.group._id)).toEqual(["a", "b"]);
    expect(entries[1].unread).toBe(9);
  });

  it("does not mark an active room when nothing is connected", () => {
    const entries = buildGroupList([group({ _id: "a" })], {
      activeRoomId: "",
    });

    expect(entries[0].isActiveRoom).toBe(false);
  });
});

describe("filterGroupList", () => {
  const entries = buildGroupList([
    group({
      _id: "a",
      name: "Выживание",
      code: "AB12CD",
      members: [{ _id: "u1", nickname: "Kituk" }],
    }),
    group({ _id: "b", name: "Технари", code: "ZZ99ZZ" }),
  ]);

  it("matches name, code and member nickname", () => {
    expect(filterGroupList(entries, "выжив").map((e) => e.group._id)).toEqual([
      "a",
    ]);
    expect(filterGroupList(entries, "zz99").map((e) => e.group._id)).toEqual([
      "b",
    ]);
    expect(filterGroupList(entries, "kit").map((e) => e.group._id)).toEqual([
      "a",
    ]);
  });

  it("returns everything for an empty query", () => {
    expect(filterGroupList(entries, "   ")).toHaveLength(2);
  });
});

describe("sortGroupMembers", () => {
  const members = [
    { _id: "offline", nickname: "Zed" },
    { _id: "online", nickname: "Ann" },
    { _id: "me", nickname: "Me" },
    { _id: "voice", nickname: "Voi" },
    { _id: "owner", nickname: "Own" },
  ];

  it("orders owner, voice, self, online, offline and then by nickname", () => {
    const sorted = sortGroupMembers(members, {
      ownerId: "owner",
      selfId: "me",
      onlineIds: new Set(["online", "voice"]),
      inVoice: ["voice"],
    });

    expect(sorted.map((member) => member._id)).toEqual([
      "owner",
      "voice",
      "me",
      "online",
      "offline",
    ]);
  });

  it("does not mutate the input", () => {
    const input = [
      { _id: "b", nickname: "B" },
      { _id: "a", nickname: "A" },
    ];
    sortGroupMembers(input, { ownerId: "x" });
    expect(input.map((member) => member._id)).toEqual(["b", "a"]);
  });
});
