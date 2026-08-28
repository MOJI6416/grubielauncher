import { describe, expect, it } from "vitest";
import { DeepLinkContext, resolveDeepLink } from "./deepLinkRoutes";

const signedIn: DeepLinkContext = {
  hasAccount: true,
  accountType: "microsoft",
  hasAccessToken: true,
};

const signedOut: DeepLinkContext = {
  hasAccount: false,
  accountType: null,
  hasAccessToken: false,
};

describe("resolveDeepLink", () => {
  it("launches a version regardless of the account", () => {
    const intent = resolveDeepLink(
      { type: "launch", versionName: "Better MC", instance: 2 },
      signedOut,
    );

    expect(intent).toEqual({
      kind: "launch",
      versionName: "Better MC",
      instance: 2,
    });
  });

  it("joins a group only with a token", () => {
    expect(resolveDeepLink({ type: "groupJoin", code: "ABC" }, signedIn)).toEqual(
      { kind: "groupJoin", code: "ABC" },
    );

    expect(
      resolveDeepLink({ type: "groupJoin", code: "ABC" }, signedOut),
    ).toEqual({
      kind: "notice",
      level: "error",
      messageKey: "groups.codeNotFound",
    });
  });

  it("explains why a skin link cannot be opened", () => {
    expect(resolveDeepLink({ type: "skin", id: "s1" }, signedOut)).toEqual({
      kind: "notice",
      level: "info",
      messageKey: "manageSkins.deepLinkNoAccount",
    });

    expect(
      resolveDeepLink(
        { type: "skin", id: "s1" },
        { ...signedIn, accountType: "plain" },
      ),
    ).toEqual({
      kind: "notice",
      level: "info",
      messageKey: "manageSkins.deepLinkPlain",
    });

    expect(
      resolveDeepLink(
        { type: "skin", id: "s1" },
        { ...signedIn, accountType: "elyby" },
      ),
    ).toEqual({
      kind: "notice",
      level: "info",
      messageKey: "manageSkins.deepLinkElyby",
    });
  });

  it("opens a skin for an account that supports it", () => {
    expect(resolveDeepLink({ type: "skin", id: "s1" }, signedIn)).toEqual({
      kind: "skin",
      skinId: "s1",
    });
  });

  it("passes web login through without an account", () => {
    expect(
      resolveDeepLink({ type: "webLogin", requestId: "r1" }, signedOut),
    ).toEqual({ kind: "webLogin", requestId: "r1" });
  });

  it("requires a token for a friend request", () => {
    expect(resolveDeepLink({ type: "friend", userId: "u1" }, signedIn)).toEqual({
      kind: "friendRequest",
      userId: "u1",
    });

    expect(resolveDeepLink({ type: "friend", userId: "u1" }, signedOut)).toEqual(
      {
        kind: "notice",
        level: "info",
        messageKey: "friends.deepLinkNoAccount",
      },
    );
  });

  it("opens a modpack link for guests too", () => {
    expect(resolveDeepLink({ type: "pack", shareCode: "code" }, signedOut)).toEqual(
      { kind: "pack", shareCode: "code" },
    );
  });
});
