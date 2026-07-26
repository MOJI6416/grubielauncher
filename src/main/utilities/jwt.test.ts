import { beforeEach, describe, expect, it, vi } from "vitest";

const { TMP } = vi.hoisted(() => {
  const nodeOs = require("os");
  const nodePath = require("path");
  return {
    TMP: nodePath.join(
      nodeOs.tmpdir(),
      `grubie-jwt-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ),
  };
});

vi.mock("electron", () => ({
  app: { getPath: () => TMP },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (buffer: Buffer) => buffer.toString(),
  },
}));

const refreshDiscordToken = vi.fn();

vi.mock("../services/Auth", () => ({
  refreshDiscordToken: (...args: unknown[]) => refreshDiscordToken(...args),
  refreshElyByToken: vi.fn(),
  refreshMicrosoftToken: vi.fn(),
}));

const readAccountsConfig = vi.fn();
const mutateAccountsConfig = vi.fn(async (_mutator: unknown) => null);

vi.mock("./accounts", () => ({
  readAccountsConfig: () => readAccountsConfig(),
  mutateAccountsConfig: (mutator: unknown) => mutateAccountsConfig(mutator),
}));

import { checkToken } from "./jwt";

function token(payload: Record<string, unknown>) {
  return [
    "header",
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

const expiredToken = token({
  sub: "user-1",
  exp: Math.floor(Date.now() / 1000) - 60,
  auth: { accessToken: "provider" },
});

const anotherExpiredToken = token({
  sub: "user-1",
  exp: Math.floor(Date.now() / 1000) - 30,
  auth: { accessToken: "provider" },
});

beforeEach(() => {
  vi.resetAllMocks();
  mutateAccountsConfig.mockResolvedValue(null);
  readAccountsConfig.mockResolvedValue({
    accounts: [
      {
        nickname: "player",
        type: "discord",
        accessToken: expiredToken,
        refreshToken: "refresh-1",
      },
    ],
  });
});

describe("checkToken", () => {
  it("returns a still-valid token without touching the provider", async () => {
    const valid = token({
      sub: "user-1",
      exp: Math.floor(Date.now() / 1000) + 600,
      auth: { accessToken: "provider" },
    });

    await expect(checkToken(valid)).resolves.toEqual({
      token: valid,
      isValid: true,
    });
    expect(refreshDiscordToken).not.toHaveBeenCalled();
  });

  it("refreshes an expired token once and persists it under the lock", async () => {
    refreshDiscordToken.mockResolvedValue({
      accessToken: "fresh",
      refreshToken: "refresh-2",
    });

    await expect(checkToken(expiredToken)).resolves.toEqual({
      token: "fresh",
      isValid: true,
    });
    expect(mutateAccountsConfig).toHaveBeenCalledTimes(1);
  });

  it("collapses parallel refreshes of the same account into one request", async () => {
    let resolveRefresh!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    refreshDiscordToken.mockReturnValue(pending);

    const first = checkToken(expiredToken);
    const second = checkToken(anotherExpiredToken);
    await Promise.resolve();

    resolveRefresh({ accessToken: "fresh", refreshToken: "refresh-2" });

    await expect(first).resolves.toEqual({ token: "fresh", isValid: true });
    await expect(second).resolves.toEqual({ token: "fresh", isValid: true });
    expect(refreshDiscordToken).toHaveBeenCalledTimes(1);
  });

  it("allows a new refresh after the previous one settled", async () => {
    refreshDiscordToken.mockResolvedValue({
      accessToken: "fresh",
      refreshToken: "refresh-2",
    });

    await checkToken(expiredToken);
    await checkToken(expiredToken);

    expect(refreshDiscordToken).toHaveBeenCalledTimes(2);
  });
});
