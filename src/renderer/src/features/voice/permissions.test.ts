import { describe, expect, it } from "vitest";
import type { IGroup } from "@/types/Voice";
import {
  canKickFromVoice,
  groupPermissions,
  memberActions,
} from "./permissions";

function group(patch: Partial<IGroup> = {}): IGroup {
  return {
    _id: "g1",
    name: "Group",
    code: "CODE01",
    owner: { _id: "owner", nickname: "owner" },
    members: [
      { _id: "owner", nickname: "owner" },
      { _id: "mate", nickname: "mate" },
    ],
    banned: [],
    isOwner: true,
    participantCount: 0,
    ...patch,
  };
}

describe("groupPermissions", () => {
  it("gives management to the owner and leaving to everyone else", () => {
    expect(groupPermissions(group())).toEqual({
      canRename: true,
      canResetCode: true,
      canDelete: true,
      canLeave: false,
      canInvite: true,
      canModerate: true,
    });

    expect(groupPermissions(group({ isOwner: false }))).toEqual({
      canRename: false,
      canResetCode: false,
      canDelete: false,
      canLeave: true,
      canInvite: true,
      canModerate: false,
    });
  });
});

describe("memberActions", () => {
  it("offers moderation only to the owner and never against themselves", () => {
    expect(memberActions(group(), "mate", "owner")).toEqual([
      "transferOwner",
      "kick",
      "ban",
    ]);
    expect(memberActions(group(), "owner", "owner")).toEqual([]);
    expect(memberActions(group({ isOwner: false }), "mate", "me")).toEqual([]);
  });
});

describe("canKickFromVoice", () => {
  it("mirrors group moderation rules", () => {
    expect(canKickFromVoice(group(), "mate", "owner")).toBe(true);
    expect(canKickFromVoice(group(), "owner", "owner")).toBe(false);
    expect(canKickFromVoice(group({ isOwner: false }), "mate", "me")).toBe(
      false,
    );
    expect(canKickFromVoice(undefined, "mate", "owner")).toBe(false);
  });
});
