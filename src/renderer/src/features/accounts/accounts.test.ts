import { describe, expect, it } from "vitest";
import type { ILocalAccount } from "@/types/Account";
import {
  accountIdentity,
  accountKey,
  accountSubject,
  decodeAccountToken,
  accountUuid,
  findAccountByIdentity,
  headImageUrl,
  isSameAccount,
} from "./identity";
import {
  formatCountdown,
  countBrokenSessions,
  readAccountSession,
  SESSION_RENEW_MARGIN_MS,
} from "./session";
import {
  isNicknameGameSafe,
  nicknameInitials,
  validateOfflineNickname,
} from "./nickname";
import {
  duplicateNicknames,
  filterAccounts,
  isAmbiguousNickname,
  nextSelectionAfterRemoval,
  removalRisk,
  runningAccountIdentities,
  sortAccounts,
} from "./list";
import { buildFaceLookup } from "./faceDirectory";
import { describeAuthFailure } from "./authErrors";
import {
  isProviderAvailable,
  providerCapabilities,
  providerFeatures,
  providerRank,
} from "./providers";

function token(payload: Record<string, unknown>): string {
  const { auth, ...claims } = payload;
  const full = {
    sub: "sub",
    uuid: "uuid",
    exp: 1,
    ...claims,
    auth: {
      accessToken: "provider-token",
      expiresAt: NOW + 86_400_000,
      ...(auth as Record<string, unknown> | undefined),
    },
  };

  return `x.${Buffer.from(JSON.stringify(full)).toString("base64url")}.y`;
}

function rawToken(payload: Record<string, unknown>): string {
  return `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
}

function account(partial: Partial<ILocalAccount>): ILocalAccount {
  return {
    nickname: "Player",
    type: "microsoft",
    image: "",
    friends: [],
    ...partial,
  };
}

const NOW = 1_700_000_000_000;

describe("identity", () => {
  it("prefers the stored id, then the token subject, then type_nickname", () => {
    expect(accountIdentity(account({ id: "stored" }))).toBe("stored");
    expect(
      accountIdentity(
        account({ accessToken: token({ sub: "from-token", exp: 1 }) }),
      ),
    ).toBe("from-token");
    expect(accountIdentity(account({ nickname: "Kituk" }))).toBe(
      "microsoft_Kituk",
    );
  });

  it("reads the subject and the minecraft uuid out of the token", () => {
    const withToken = account({
      accessToken: token({ sub: "sub-1", uuid: "uuid-1", exp: 1 }),
    });

    expect(accountSubject(withToken)).toBe("sub-1");
    expect(accountUuid(withToken)).toBe("uuid-1");
    expect(accountSubject(account({}))).toBeNull();
    expect(accountUuid(account({ accessToken: "not-a-jwt" }))).toBeNull();
  });

  it("treats the same nickname under different providers as different accounts", () => {
    const microsoft = account({ nickname: "moji6416", type: "microsoft" });
    const discord = account({ nickname: "moji6416", type: "discord" });

    expect(isSameAccount(microsoft, discord)).toBe(false);
    expect(accountKey(microsoft)).not.toBe(accountKey(discord));
  });

  it("matches the same provider account after a nickname change", () => {
    const before = account({
      nickname: "Old",
      accessToken: token({ sub: "same", exp: 1 }),
    });
    const after = account({
      nickname: "New",
      accessToken: token({ sub: "same", exp: 2 }),
    });

    expect(isSameAccount(before, after)).toBe(true);
  });

  it("finds an account by identity and falls back to the legacy key", () => {
    const accounts = [
      account({ nickname: "Kituk", id: "id-1" }),
      account({ nickname: "moji6416", type: "discord" }),
    ];

    expect(findAccountByIdentity(accounts, "id-1")?.nickname).toBe("Kituk");
    expect(findAccountByIdentity(accounts, "discord_moji6416")?.type).toBe(
      "discord",
    );
    expect(findAccountByIdentity(accounts, "missing")).toBeNull();
    expect(findAccountByIdentity(accounts, null)).toBeNull();
  });

  it("builds head urls per provider and skips offline accounts", () => {
    const base = "https://api.grubielauncher.com";

    expect(
      headImageUrl(
        account({ accessToken: token({ sub: "s", uuid: "uuid-1", exp: 1 }) }),
        base,
      ),
    ).toBe(`${base}/skins/head/microsoft/uuid-1`);

    expect(
      headImageUrl(account({ type: "elyby", nickname: "Kit uk" }), base),
    ).toBe(`${base}/skins/head/elyby/Kit%20uk`);

    expect(headImageUrl(account({ type: "plain" }), base)).toBeNull();
    expect(headImageUrl(account({}), base)).toBeNull();
  });

  it("appends a cache-busting version when asked", () => {
    const url = headImageUrl(
      account({ type: "elyby", nickname: "Kituk" }),
      "https://api.grubielauncher.com",
      7,
    );

    expect(url).toBe(
      "https://api.grubielauncher.com/skins/head/elyby/Kituk?v=7",
    );
  });

  it("prefers an explicit uuid over the one inside the token", () => {
    const base = "https://api.grubielauncher.com";

    expect(
      headImageUrl(
        {
          type: "discord",
          nickname: "Player",
          uuid: "explicit-uuid",
          accessToken: token({ sub: "s", uuid: "token-uuid", exp: 1 }),
        },
        base,
      ),
    ).toBe(`${base}/skins/head/discord/explicit-uuid`);

    expect(
      headImageUrl({ type: "discord", nickname: "Player", uuid: "  " }, base),
    ).toBeNull();
  });
});

describe("face lookup", () => {
  it("fills the provider and uuid of a known player", () => {
    const lookup = buildFaceLookup(
      new Map([["u1", { type: "discord" as const, uuid: "uuid-1" }]]),
    );

    expect(lookup({ _id: "u1", nickname: "Player" })).toEqual({
      type: "discord",
      nickname: "Player",
      id: "u1",
      uuid: "uuid-1",
    });
  });

  it("keeps the account id of an unknown player so the head still resolves", () => {
    const lookup = buildFaceLookup(new Map());

    expect(lookup({ _id: "u2", nickname: "Stranger" })).toEqual({
      type: "plain",
      nickname: "Stranger",
      id: "u2",
      uuid: null,
    });
    expect(lookup({ nickname: "Nameless" }).type).toBe("plain");
  });
});

describe("session state", () => {
  it("marks offline accounts as needing no session", () => {
    const info = readAccountSession(account({ type: "plain" }), NOW);

    expect(info.state).toBe("offline");
    expect(info.needsSignIn).toBe(false);
    expect(info.expiresAt).toBeNull();
  });

  it("reports an active session while both tokens are valid", () => {
    const info = readAccountSession(
      account({
        accessToken: token({
          sub: "s",
          exp: (NOW + 3_600_000) / 1000,
          auth: { expiresAt: NOW + 7_200_000 },
        }),
        refreshToken: "r",
      }),
      NOW,
    );

    expect(info.state).toBe("active");
    expect(info.expiresAt).toBe(NOW + 3_600_000);
    expect(info.msLeft).toBe(3_600_000);
  });

  it("uses the earliest of the launcher and provider expiry", () => {
    const info = readAccountSession(
      account({
        accessToken: token({
          sub: "s",
          exp: (NOW + 7_200_000) / 1000,
          auth: { expiresAt: NOW + 60_000 },
        }),
        refreshToken: "r",
      }),
      NOW,
    );

    expect(info.expiresAt).toBe(NOW + 60_000);
    expect(info.launcherExpiresAt).toBe(NOW + 7_200_000);
    expect(info.providerExpiresAt).toBe(NOW + 60_000);
  });

  it("calls an expired session renewable when a refresh token is stored", () => {
    const expired = {
      accessToken: token({ sub: "s", exp: (NOW - 10_000) / 1000 }),
    };

    expect(
      readAccountSession(account({ ...expired, refreshToken: "r" }), NOW),
    ).toMatchObject({ state: "renewable", needsSignIn: false });
    expect(readAccountSession(account(expired), NOW)).toMatchObject({
      state: "expired",
      needsSignIn: true,
    });
  });

  it("flags the renew window without a refresh token as expiring", () => {
    const info = readAccountSession(
      account({
        accessToken: token({
          sub: "s",
          exp: (NOW + SESSION_RENEW_MARGIN_MS - 1000) / 1000,
        }),
      }),
      NOW,
    );

    expect(info.state).toBe("expiring");
    expect(info.needsSignIn).toBe(false);
  });

  it("refuses a token that is not a launcher session token", () => {
    const gameToken = rawToken({
      sub: "s",
      uuid: "uuid",
      nickname: "Player",
      scope: "minecraft",
      exp: (NOW + 3_600_000) / 1000,
    });

    expect(decodeAccountToken(gameToken)).toBeNull();
    expect(accountSubject(account({ accessToken: gameToken }))).toBeNull();
    expect(readAccountSession(account({ accessToken: gameToken }), NOW)).toMatchObject(
      { state: "expired", needsSignIn: true },
    );

    expect(
      decodeAccountToken(
        rawToken({
          sub: "s",
          uuid: "uuid",
          exp: 1,
          auth: { expiresAt: NOW },
        }),
      ),
    ).toBeNull();
    expect(
      decodeAccountToken(
        rawToken({
          uuid: "uuid",
          exp: 1,
          auth: { accessToken: "t", expiresAt: NOW },
        }),
      ),
    ).toBeNull();
  });

  it("treats a missing or unreadable token as a broken session", () => {
    expect(readAccountSession(account({}), NOW).state).toBe("expired");
    expect(
      readAccountSession(account({ accessToken: "garbage" }), NOW).state,
    ).toBe("expired");
    expect(
      readAccountSession(
        account({ accessToken: "garbage", refreshToken: "r" }),
        NOW,
      ).state,
    ).toBe("renewable");
  });

  it("counts only the sessions that need a new sign-in", () => {
    const accounts = [
      account({ type: "plain" }),
      account({ accessToken: token({ sub: "a", exp: (NOW + 1000) / 1000 }) }),
      account({ nickname: "Broken" }),
      account({ nickname: "Stale", refreshToken: "r" }),
    ];

    expect(countBrokenSessions(accounts, NOW)).toBe(1);
  });

  it("formats a countdown as minutes and seconds", () => {
    expect(formatCountdown(600_000)).toBe("10:00");
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("offline nickname validation", () => {
  it("accepts a normal minecraft nickname", () => {
    expect(validateOfflineNickname("Notch")).toBeNull();
    expect(validateOfflineNickname("  Player_1  ")).toBeNull();
  });

  it("rejects the length and character violations", () => {
    expect(validateOfflineNickname("")).toBe("empty");
    expect(validateOfflineNickname("ab")).toBe("tooShort");
    expect(validateOfflineNickname("a".repeat(17))).toBe("tooLong");
    expect(validateOfflineNickname("плеер")).toBe("chars");
    expect(validateOfflineNickname("has space")).toBe("chars");
  });

  it("rejects a duplicate offline nickname regardless of case", () => {
    const existing = [
      { nickname: "Notch", type: "plain" as const },
      { nickname: "Kituk", type: "microsoft" as const },
    ];

    expect(validateOfflineNickname("notch", existing)).toBe("duplicate");
    expect(validateOfflineNickname("Kituk", existing)).toBeNull();
  });

  it("detects nicknames the game will not accept", () => {
    expect(isNicknameGameSafe("Kituk")).toBe(true);
    expect(isNicknameGameSafe("a".repeat(17))).toBe(false);
    expect(isNicknameGameSafe("ник")).toBe(false);
  });

  it("builds initials for the avatar fallback", () => {
    expect(nicknameInitials("moji6416")).toBe("MO");
    expect(nicknameInitials(" ")).toBe("?");
  });
});

describe("account list", () => {
  const microsoft = account({
    nickname: "moji6416",
    type: "microsoft",
    id: "m",
  });
  const discord = account({ nickname: "moji6416", type: "discord", id: "d" });
  const elyby = account({ nickname: "Kituk", type: "elyby", id: "e" });
  const plain = account({ nickname: "Steve", type: "plain" });

  it("finds nicknames shared by several providers", () => {
    const duplicates = duplicateNicknames([microsoft, discord, elyby]);

    expect(duplicates.has("moji6416")).toBe(true);
    expect(duplicates.has("kituk")).toBe(false);
    expect(isAmbiguousNickname(discord, duplicates)).toBe(true);
    expect(isAmbiguousNickname(elyby, duplicates)).toBe(false);
  });

  it("does not merge same-nickname accounts from different providers", () => {
    expect(sortAccounts([microsoft, discord])).toHaveLength(2);
  });

  it("pins the selected account and then orders by provider", () => {
    const sorted = sortAccounts([plain, elyby, microsoft, discord], "e");

    expect(sorted.map((item) => item.type)).toEqual([
      "elyby",
      "discord",
      "microsoft",
      "plain",
    ]);
  });

  it("orders by provider and nickname without a selection", () => {
    expect(providerRank("discord")).toBeLessThan(providerRank("plain"));
    expect(sortAccounts([plain, elyby, discord]).map((i) => i.type)).toEqual([
      "discord",
      "elyby",
      "plain",
    ]);
  });

  it("filters by nickname and by provider", () => {
    const all = [microsoft, discord, elyby, plain];

    expect(filterAccounts(all, "kit")).toEqual([elyby]);
    expect(filterAccounts(all, "discord")).toEqual([discord]);
    expect(filterAccounts(all, "  ")).toEqual(all);
  });

  it("warns before removing the last, the selected, or a running account", () => {
    expect(removalRisk([plain], plain)).toBe("last");
    expect(
      removalRisk([microsoft, discord], discord, { selectedIdentity: "d" }),
    ).toBe("selected");
    expect(
      removalRisk([microsoft, discord], discord, {
        selectedIdentity: "d",
        isRunning: true,
      }),
    ).toBe("running");
    expect(
      removalRisk([microsoft, discord], discord, { selectedIdentity: "m" }),
    ).toBeNull();
  });

  it("warns about a running account even when another one is selected", () => {
    expect(
      removalRisk([microsoft, discord], discord, {
        selectedIdentity: "m",
        isRunning: true,
      }),
    ).toBe("running");
  });

  it("collects the accounts of running instances only", () => {
    const running = runningAccountIdentities([
      { status: "running", account: "d" },
      { status: "stopped", account: "m" },
      { status: "error", account: "e" },
      { status: "running" },
    ]);

    expect([...running]).toEqual(["d"]);
  });

  it("keeps the current selection when another account is removed", () => {
    const next = nextSelectionAfterRemoval(
      [microsoft, discord, elyby],
      "e",
      "d",
    );

    expect(next?.id).toBe("d");
  });

  it("moves the selection to a healthy account when the current one goes away", () => {
    const broken = account({ nickname: "Broken", type: "microsoft", id: "b" });
    const healthy = account({
      nickname: "Live",
      type: "elyby",
      id: "h",
      accessToken: token({ sub: "h", exp: Date.now() / 1000 + 3600 }),
    });

    const next = nextSelectionAfterRemoval([broken, healthy], "b", "b");
    expect(next?.id).toBe("h");
  });

  it("returns nothing when the last account is removed", () => {
    expect(
      nextSelectionAfterRemoval([plain], "plain_Steve", "plain_Steve"),
    ).toBeNull();
  });
});

describe("login failures", () => {
  it("stays silent when the user cancelled the flow", () => {
    expect(
      describeAuthFailure(new Error("OAuth server was stopped."), "discord"),
    ).toMatchObject({ reason: "cancelled", silent: true });
    expect(
      describeAuthFailure(new Error("OAuth server was restarted."), "discord"),
    ).toMatchObject({ reason: "cancelled", silent: true });
  });

  it("names the ten minute timeout", () => {
    expect(
      describeAuthFailure(new Error("OAuth callback timed out."), "microsoft"),
    ).toMatchObject({ reason: "timeout", silent: false });
  });

  it("recognises a busy callback port", () => {
    const error = Object.assign(new Error("listen EADDRINUSE :::53213"), {
      code: "EADDRINUSE",
    });

    expect(describeAuthFailure(error, "elyby").reason).toBe("portBusy");
  });

  it("separates a rejected authorization from a network problem", () => {
    expect(
      describeAuthFailure({ response: { status: 401 } }, "microsoft").reason,
    ).toBe("rejected");
    expect(describeAuthFailure({ code: "ENOTFOUND" }, "microsoft").reason).toBe(
      "network",
    );
    expect(
      describeAuthFailure({ response: { status: 503 } }, "discord").reason,
    ).toBe("provider");
  });

  it("carries a copyable code for every failure", () => {
    const failure = describeAuthFailure(new Error("boom"), "discord");

    expect(failure.reason).toBe("unknown");
    expect(failure.code).toContain("DSC");
  });
});

describe("provider capabilities", () => {
  it("keeps ely.by skins external and capes discord-only", () => {
    expect(providerCapabilities("elyby").skins).toBe("external");
    expect(providerCapabilities("discord").capes).toBe(true);
    expect(providerCapabilities("microsoft").capes).toBe(false);
    expect(providerCapabilities("microsoft").resetSkin).toBe(true);
    expect(providerCapabilities("discord").resetSkin).toBe(false);
  });

  it("lets the offline account work without any service", () => {
    const plain = providerCapabilities("plain");

    expect(plain.requiresInternet).toBe(false);
    expect(plain.requiresBackend).toBe(false);
  });

  it("lists the same feature slots for every provider, marked available or not", () => {
    const keys = (type: Parameters<typeof providerFeatures>[0]) =>
      providerFeatures(type).map((feature) => feature.key);

    expect(keys("microsoft")).toEqual([
      "onlineServers",
      "skinsManaged",
      "capes",
      "friends",
      "worksOffline",
    ]);
    expect(keys("elyby")).toContain("skinsExternal");

    const plain = Object.fromEntries(
      providerFeatures("plain").map((f) => [f.key, f.available]),
    );
    expect(plain.worksOffline).toBe(true);
    expect(plain.skinsManaged).toBe(false);
    expect(plain.onlineServers).toBe(false);

    const discord = Object.fromEntries(
      providerFeatures("discord").map((f) => [f.key, f.available]),
    );
    expect(discord.capes).toBe(true);
    expect(discord.onlineServers).toBe(false);
    expect(discord.worksOffline).toBe(false);
  });

  it("hides providers that cannot work in the current connectivity", () => {
    const offline = { isInternetOnline: false, isBackendOnline: false };
    const noBackend = { isInternetOnline: true, isBackendOnline: false };

    expect(isProviderAvailable("plain", offline)).toBe(true);
    expect(isProviderAvailable("microsoft", offline)).toBe(false);
    expect(isProviderAvailable("discord", noBackend)).toBe(false);
    expect(isProviderAvailable("elyby", noBackend)).toBe(true);
  });
});
