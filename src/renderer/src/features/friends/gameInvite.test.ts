import { describe, expect, it } from "vitest";
import { GameInvite } from "@/types/GameInvite";
import {
  describeIncomingInvite,
  describeInviteNotification,
} from "./gameInvite";

const base = {
  inviteId: "i1",
  sender: { nickname: "moji6416" } as GameInvite["sender"],
  versionName: "Fabulously Optimized",
  versionCode: "abc",
  createdAt: "2026-08-20T00:00:00.000Z",
};

const serverInvite: GameInvite = {
  ...base,
  target: { type: "server", address: "play.example.com" },
};

const worldInvite: GameInvite = {
  ...base,
  target: {
    type: "world",
    slug: "slug",
    sessionId: "s1",
    publicAddress: "1.2.3.4",
  },
};

describe("describeIncomingInvite", () => {
  it("names the server address for server invites", () => {
    expect(describeIncomingInvite(serverInvite)).toEqual({
      messageKey: "friends.gameInviteServerBody",
      params: {
        nickname: "moji6416",
        version: "Fabulously Optimized",
        address: "play.example.com",
      },
    });
  });

  it("omits the address for world invites", () => {
    expect(describeIncomingInvite(worldInvite)).toEqual({
      messageKey: "friends.gameInviteWorldBody",
      params: { nickname: "moji6416", version: "Fabulously Optimized" },
    });
  });
});

describe("describeInviteNotification", () => {
  it("uses the notification keys", () => {
    expect(describeInviteNotification(serverInvite).messageKey).toBe(
      "friends.gameInviteNotificationServer",
    );
    expect(describeInviteNotification(worldInvite).messageKey).toBe(
      "friends.gameInviteNotificationWorld",
    );
  });
});
