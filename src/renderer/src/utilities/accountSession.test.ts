import type { IAuth, ILocalAccount } from "@/types/Account";
import { afterEach, describe, expect, it, vi } from "vitest";

const account: ILocalAccount = {
  nickname: "player",
  type: "discord",
  accessToken: "old-token",
  image: "",
  friends: [],
};

const expiredAuth: IAuth = {
  sub: "discord-user-id",
  exp: Math.floor(Date.now() / 1000) - 60,
  nickname: "player",
  uuid: "uuid",
  auth: {
    accessToken: "provider-access-token",
    refreshToken: "expired-refresh-token",
    expiresAt: Date.now() - 60_000,
    createdAt: Date.now() - 120_000,
  },
};

function jwt(payload: Partial<IAuth>) {
  return [
    "header",
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

async function loadAccountSession(api: unknown) {
  vi.resetModules();
  vi.stubGlobal("window", { api });
  return await import("./accountSession");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("ensureAccountSession", () => {
  it("uses a fresher stored token instead of refreshing an already rotated token", async () => {
    const freshAuth: IAuth = {
      ...expiredAuth,
      exp: Math.floor(Date.now() / 1000) + 3600,
      auth: {
        ...expiredAuth.auth,
        refreshToken: "rotated-refresh-token",
        expiresAt: Date.now() + 3600_000,
      },
    };
    const freshAccount = {
      ...account,
      accessToken: jwt(freshAuth),
    };
    const api = {
      auth: {
        discordRefresh: vi.fn(),
      },
      accounts: {
        load: vi.fn().mockResolvedValue({
          accounts: [freshAccount],
          lastPlayed: "discord_player",
        }),
        save: vi.fn(),
      },
    };
    const setAccounts = vi.fn();
    const setSelectedAccount = vi.fn();
    const { ensureAccountSession } = await loadAccountSession(api);

    const result = await ensureAccountSession({
      accounts: [account],
      authData: expiredAuth,
      selectedAccount: account,
      setAccounts,
      setSelectedAccount,
    });

    expect(result).toMatchObject({
      account: freshAccount,
      accounts: [freshAccount],
      refreshed: true,
    });
    expect(api.auth.discordRefresh).not.toHaveBeenCalled();
    expect(api.accounts.save).not.toHaveBeenCalled();
    expect(setSelectedAccount).toHaveBeenCalledWith(freshAccount);
    expect(setAccounts).toHaveBeenCalledWith([freshAccount]);
  });

  it("throws a typed session refresh error when provider refresh fails", async () => {
    const api = {
      auth: {
        discordRefresh: vi.fn().mockResolvedValue(null),
      },
      accounts: {
        save: vi.fn(),
      },
    };
    const { ensureAccountSession, isAccountSessionRefreshError } =
      await loadAccountSession(api);

    let error: unknown;
    try {
      await ensureAccountSession({
        accounts: [account],
        authData: expiredAuth,
        selectedAccount: account,
        setAccounts: vi.fn(),
        setSelectedAccount: vi.fn(),
      });
    } catch (err) {
      error = err;
    }

    expect(isAccountSessionRefreshError(error)).toBe(true);
    expect(error).toMatchObject({
      code: "account_session_refresh_failed",
      provider: "discord",
    });
    expect(api.accounts.save).not.toHaveBeenCalled();
  });

  it("updates and saves the account when provider refresh succeeds", async () => {
    const api = {
      auth: {
        discordRefresh: vi.fn().mockResolvedValue({ accessToken: "fresh-token" }),
      },
      accounts: {
        save: vi.fn().mockResolvedValue(undefined),
      },
    };
    const setAccounts = vi.fn();
    const setSelectedAccount = vi.fn();
    const { ensureAccountSession } = await loadAccountSession(api);

    const result = await ensureAccountSession({
      accounts: [account],
      authData: expiredAuth,
      selectedAccount: account,
      setAccounts,
      setSelectedAccount,
    });

    expect(result.refreshed).toBe(true);
    expect(result.account.accessToken).toBe("fresh-token");
    expect(setSelectedAccount).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "fresh-token" }),
    );
    expect(setAccounts).toHaveBeenCalledWith([
      expect.objectContaining({ accessToken: "fresh-token" }),
    ]);
    expect(api.accounts.save).toHaveBeenCalledWith(
      [expect.objectContaining({ accessToken: "fresh-token" })],
      "discord_player",
    );
  });
});
