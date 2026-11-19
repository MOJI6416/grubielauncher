import { describe, expect, it } from "vitest";
import type { IFriend } from "@/types/IFriend";
import type { MsFriend, MsFriendsSnapshot } from "@/shared/msFriends";
import {
  listMsFriends,
  mergeSnapshot,
  msPresenceKind,
  msStatusKey,
  withoutGrubieFriends,
} from "./msFriendsModel";

const NOTCH = "069a79f444e94726a5befca90e38aaf5";
const JEB = "853c80ef3c3749fdaa49938b674adae6";
const DINNER = "61699b2ed3274a019f1e0ea8c3f06bc6";

function grubieFriend(platform: string, uuid: string): IFriend {
  return {
    user: { _id: `u-${uuid}`, nickname: "x", platform, uuid },
  } as unknown as IFriend;
}

const msFriends: MsFriend[] = [
  { profileId: NOTCH, name: "Notch", status: "OFFLINE" },
  { profileId: JEB, name: "jeb_", status: "PLAYING_SERVER" },
  { profileId: DINNER, name: "Dinnerbone", status: "ONLINE" },
];

describe("Microsoft friends next to ours", () => {
  it("drops a Microsoft friend who is already a Grubie friend on the same profile", () => {
    const friends = [grubieFriend("microsoft", "853c80ef-3c37-49fd-aa49-938b674adae6")];
    expect(withoutGrubieFriends(msFriends, friends).map((f) => f.name)).toEqual([
      "Notch",
      "Dinnerbone",
    ]);
  });

  it("keeps a Microsoft friend whose UUID only matches a non-Microsoft Grubie account", () => {
    const friends = [grubieFriend("elyby", JEB)];
    expect(withoutGrubieFriends(msFriends, friends)).toHaveLength(3);
  });

  it("orders playing, then online, then offline, and follows search and filters", () => {
    expect(listMsFriends(msFriends, [], "", "all").map((f) => f.name)).toEqual([
      "jeb_",
      "Dinnerbone",
      "Notch",
    ]);
    expect(listMsFriends(msFriends, [], "", "online").map((f) => f.name)).toEqual([
      "jeb_",
      "Dinnerbone",
    ]);
    expect(listMsFriends(msFriends, [], "DINNER", "all").map((f) => f.name)).toEqual([
      "Dinnerbone",
    ]);
    expect(listMsFriends(msFriends, [], "", "unread")).toEqual([]);
  });

  it("names every status", () => {
    expect(msPresenceKind("PLAYING_REALMS")).toBe("playing");
    expect(msPresenceKind("ONLINE")).toBe("online");
    expect(msPresenceKind(undefined)).toBe("offline");
    expect(msStatusKey("PLAYING_HOSTED_SERVER")).toBe("friends.microsoft.status.hosted");
    expect(msStatusKey(undefined)).toBe("friends.microsoft.status.unknown");
  });

  it("keeps the last known status when a refresh came without presence", () => {
    const previous: MsFriendsSnapshot = {
      friends: [{ profileId: JEB, name: "jeb_", status: "PLAYING_SERVER" }],
      incoming: [],
      outgoing: [],
      fetchedAt: "",
    };
    const next: MsFriendsSnapshot = {
      friends: [{ profileId: JEB, name: "jeb_" }, { profileId: NOTCH, name: "Notch" }],
      incoming: [],
      outgoing: [],
      fetchedAt: "",
    };
    expect(mergeSnapshot(previous, next).friends).toEqual([
      { profileId: JEB, name: "jeb_", status: "PLAYING_SERVER", lastUpdated: undefined },
      { profileId: NOTCH, name: "Notch", status: undefined, lastUpdated: undefined },
    ]);
  });
});
