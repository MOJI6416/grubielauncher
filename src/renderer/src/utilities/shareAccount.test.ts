import { describe, expect, it } from "vitest";
import type { ILocalAccount } from "@/types/Account";
import type { ShareState } from "@/types/Share";
import {
  canCurrentAccountManageShare,
  getShareAccountKey,
  isShareStateActiveForAccountBinding,
} from "./shareAccount";

function account(nickname: string, type: ILocalAccount["type"] = "microsoft") {
  return {
    nickname,
    type,
    image: "",
    friends: [],
  } as ILocalAccount;
}

function shareState(overrides: Partial<ShareState> = {}) {
  return {
    phase: "idle",
    candidate: null,
    target: null,
    isTunnelConnected: false,
    isAuthenticated: false,
    isHeartbeatActive: false,
    isDegraded: false,
    reconnectAttempt: 0,
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  } as ShareState;
}

describe("share account helpers", () => {
  it("creates a stable local account key", () => {
    expect(getShareAccountKey(account("Steve", "elyby"))).toBe("elyby_Steve");
    expect(getShareAccountKey(null)).toBeNull();
  });

  it("allows managing unbound share state and matching account share state", () => {
    expect(canCurrentAccountManageShare(null, account("Steve"))).toBe(true);
    expect(
      canCurrentAccountManageShare("microsoft_Steve", account("Steve")),
    ).toBe(true);
  });

  it("blocks managing share state from another account", () => {
    expect(
      canCurrentAccountManageShare("microsoft_Steve", account("Alex")),
    ).toBe(false);
  });

  it("treats candidate/session phases as active for account binding", () => {
    expect(isShareStateActiveForAccountBinding(shareState())).toBe(false);
    expect(
      isShareStateActiveForAccountBinding(
        shareState({
          phase: "lan_ready",
          candidate: {
            key: "Version-0",
            versionName: "Version",
            instance: 0,
            localPort: 25565,
            detectedAt: new Date(0).toISOString(),
            isReachable: true,
          },
        }),
      ),
    ).toBe(true);
    expect(
      isShareStateActiveForAccountBinding(
        shareState({ phase: "online", sessionId: "session" }),
      ),
    ).toBe(true);
  });
});
