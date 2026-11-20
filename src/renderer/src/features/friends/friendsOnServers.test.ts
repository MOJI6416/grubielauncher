import { describe, expect, it } from "vitest";
import type { IFriend } from "@/types/IFriend";
import { friendsOn, groupFriendsByServer } from "./friendsOnServers";

function friend(
  id: string,
  nickname: string,
  serverAddress: string,
  isOnline = true,
): IFriend {
  return {
    user: { _id: id, nickname } as IFriend["user"],
    isOnline,
    versionName: "Сборка",
    versionCode: "",
    serverAddress,
  };
}

describe("friends on servers", () => {
  it("matches the address the way the server list does", () => {
    const groups = groupFriendsByServer([
      friend("1", "Steve", "Play.Example.com:25565"),
      friend("2", "alex", "play.example.com"),
      friend("3", "Notch", "play.example.com:25566"),
    ]);

    expect(
      friendsOn(groups, "play.example.com").map((entry) => entry.user.nickname),
    ).toEqual(["alex", "Steve"]);
    expect(
      friendsOn(groups, "PLAY.EXAMPLE.COM:25566").map(
        (entry) => entry.user.nickname,
      ),
    ).toEqual(["Notch"]);
  });

  it("leaves out friends who are offline or not on a server", () => {
    const groups = groupFriendsByServer([
      friend("1", "Steve", "mc.example.net", false),
      friend("2", "Alex", ""),
    ]);

    expect(groups.size).toBe(0);
    expect(friendsOn(groups, "mc.example.net")).toEqual([]);
    expect(friendsOn(groups, "")).toEqual([]);
  });
});
