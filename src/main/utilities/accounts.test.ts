import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "path";

const { TMP } = vi.hoisted(() => {
  const nodeOs = require("os");
  const nodePath = require("path");
  return {
    TMP: nodePath.join(
      nodeOs.tmpdir(),
      `grubie-accounts-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
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

import {
  getSelectedAccount,
  loadAccountsConfig,
  mergeIncomingAccounts,
  mutateAccountsConfig,
  readAccountsConfig,
  saveAccountsConfig,
} from "./accounts";
import { IAccountConf } from "@/types/Account";

const launcherDir = path.join(TMP, ".grubielauncher");
const accountsPath = path.join(launcherDir, "accounts.json");
const secretsPath = path.join(launcherDir, "accounts.secrets.json");

function makeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.sig`;
}

const futureExp = Math.floor(Date.now() / 1000) + 3600;

beforeEach(async () => {
  await fs.remove(launcherDir);
  await fs.ensureDir(launcherDir);
});

afterAll(async () => {
  await fs.remove(TMP);
});

describe("plain accounts (no token / no sub)", () => {
  it("saves without an id or secret and round-trips unchanged", async () => {
    const config: IAccountConf = {
      accounts: [{ nickname: "Notch", type: "plain", image: "", friends: [] }],
      lastPlayed: "plain_Notch",
    };

    await saveAccountsConfig(config);

    const persisted = await fs.readJSON(accountsPath);
    expect(persisted.accounts[0].id).toBeUndefined();
    expect(persisted.accounts[0].accessToken).toBeUndefined();

    const secrets = await fs.readJSON(secretsPath);
    expect(Object.keys(secrets)).toHaveLength(0);

    const read = await readAccountsConfig();
    expect(read?.accounts[0]).toMatchObject({ nickname: "Notch", type: "plain" });
    expect(read?.accounts[0].accessToken).toBeUndefined();

    const selected = await getSelectedAccount();
    expect(selected?.nickname).toBe("Notch");
  });

  it("coexists with a token account without collision", async () => {
    const token = makeJwt({ sub: "ms-uuid-1", exp: futureExp });
    await saveAccountsConfig({
      accounts: [
        { nickname: "Notch", type: "plain", image: "", friends: [] },
        { nickname: "Steve", type: "microsoft", image: "", friends: [], accessToken: token },
      ],
      lastPlayed: "plain_Notch",
    });

    const secrets = await fs.readJSON(secretsPath);
    expect(Object.keys(secrets)).toEqual(["ms-uuid-1"]);

    const read = await readAccountsConfig();
    const plain = read?.accounts.find((a) => a.type === "plain");
    const ms = read?.accounts.find((a) => a.type === "microsoft");
    expect(plain?.accessToken).toBeUndefined();
    expect(ms?.accessToken).toBe(token);
    expect(ms?.id).toBe("ms-uuid-1");
  });
});

describe("token accounts keyed by sub", () => {
  it("keeps the secret across a nickname change (same sub)", async () => {
    const oldToken = makeJwt({ sub: "ms-uuid-9", exp: futureExp });
    await saveAccountsConfig({
      accounts: [
        { nickname: "OldName", type: "microsoft", image: "", friends: [], accessToken: oldToken },
      ],
      lastPlayed: "microsoft_OldName",
    });

    const renamedToken = makeJwt({ sub: "ms-uuid-9", exp: futureExp });
    await saveAccountsConfig({
      accounts: [
        { nickname: "NewName", type: "microsoft", image: "", friends: [], accessToken: renamedToken },
      ],
      lastPlayed: "microsoft_NewName",
    });

    const secrets = await fs.readJSON(secretsPath);
    expect(Object.keys(secrets)).toEqual(["ms-uuid-9"]);

    const read = await readAccountsConfig();
    expect(read?.accounts[0].nickname).toBe("NewName");
    expect(read?.accounts[0].accessToken).toBe(renamedToken);
  });

  it("stores provider refresh tokens only in the secret store", async () => {
    const token = makeJwt({ sub: "discord-1", exp: futureExp });
    await saveAccountsConfig({
      accounts: [
        {
          nickname: "DiscordUser",
          type: "discord",
          image: "",
          friends: [],
          accessToken: token,
          refreshToken: "provider-refresh",
        },
      ],
      lastPlayed: "discord_DiscordUser",
    });

    const persisted = await fs.readJSON(accountsPath);
    expect(persisted.accounts[0].refreshToken).toBeUndefined();

    const secrets = await fs.readJSON(secretsPath);
    expect(secrets["discord-1:refresh"].value).toBe("provider-refresh");

    const read = await readAccountsConfig();
    expect(read?.accounts[0].refreshToken).toBe("provider-refresh");
  });

  it("migrates a refresh token out of an old JWT", async () => {
    const token = makeJwt({
      sub: "microsoft-legacy",
      exp: futureExp,
      auth: { refreshToken: "legacy-refresh" },
    });
    await fs.writeJSON(accountsPath, {
      accounts: [
        { nickname: "Steve", type: "microsoft", image: "", friends: [] },
      ],
      lastPlayed: "microsoft_Steve",
    });
    await fs.writeJSON(secretsPath, {
      microsoft_Steve: { mode: "plain", value: token },
    });

    const read = await readAccountsConfig();
    expect(read?.accounts[0].refreshToken).toBe("legacy-refresh");

    const secrets = await fs.readJSON(secretsPath);
    expect(secrets["microsoft-legacy:refresh"].value).toBe("legacy-refresh");
  });
});

describe("legacy type_nickname migration", () => {
  it("re-keys a legacy secret to the token sub on read", async () => {
    const token = makeJwt({ sub: "ely-uuid-7", exp: futureExp });
    await fs.writeJSON(accountsPath, {
      accounts: [{ nickname: "Alex", type: "elyby", image: "", friends: [] }],
      lastPlayed: "elyby_Alex",
    });
    await fs.writeJSON(secretsPath, {
      elyby_Alex: { mode: "plain", value: token },
    });

    const read = await readAccountsConfig();
    expect(read?.accounts[0].accessToken).toBe(token);
    expect(read?.accounts[0].id).toBe("ely-uuid-7");

    const secrets = await fs.readJSON(secretsPath);
    expect(Object.keys(secrets)).toEqual(["ely-uuid-7"]);

    const persisted = await fs.readJSON(accountsPath);
    expect(persisted.accounts[0].id).toBe("ely-uuid-7");
  });
});

describe("lastPlayed keyed by a stable identity", () => {
  it("stores the selection by token subject and survives a nickname change", async () => {
    const token = makeJwt({ sub: "ms-uuid-42", exp: futureExp });
    const accounts = (nickname: string) => [
      { nickname: "Notch", type: "plain" as const, image: "", friends: [] },
      {
        nickname,
        type: "microsoft" as const,
        image: "",
        friends: [],
        accessToken: token,
      },
    ];

    await saveAccountsConfig({
      accounts: accounts("OldName"),
      lastPlayed: "microsoft_OldName",
    });
    expect((await fs.readJSON(accountsPath)).lastPlayed).toBe("ms-uuid-42");

    await saveAccountsConfig({
      accounts: accounts("NewName"),
      lastPlayed: "ms-uuid-42",
    });

    expect((await getSelectedAccount())?.nickname).toBe("NewName");
    expect((await loadAccountsConfig()).lastPlayed).toBe("microsoft_NewName");
  });

  it("keeps honouring a legacy type_nickname selection on disk", async () => {
    const token = makeJwt({ sub: "ely-uuid-3", exp: futureExp });
    await fs.writeJSON(accountsPath, {
      accounts: [
        { nickname: "Steve", type: "plain", image: "", friends: [] },
        { nickname: "Alex", type: "elyby", image: "", friends: [] },
      ],
      lastPlayed: "elyby_Alex",
    });
    await fs.writeJSON(secretsPath, {
      elyby_Alex: { mode: "plain", value: token },
    });

    expect((await getSelectedAccount())?.nickname).toBe("Alex");
    expect((await fs.readJSON(accountsPath)).lastPlayed).toBe("ely-uuid-3");
    expect((await loadAccountsConfig()).lastPlayed).toBe("elyby_Alex");
  });

  it("leaves an account without a token keyed by type_nickname", async () => {
    await saveAccountsConfig({
      accounts: [{ nickname: "Notch", type: "plain", image: "", friends: [] }],
      lastPlayed: "plain_Notch",
    });

    expect((await fs.readJSON(accountsPath)).lastPlayed).toBe("plain_Notch");
    expect((await getSelectedAccount())?.nickname).toBe("Notch");
  });
});

describe("unreadable store never gets overwritten", () => {
  const token = makeJwt({ sub: "ms-uuid-keep", exp: futureExp });

  async function seedOneAccount() {
    await saveAccountsConfig({
      accounts: [
        {
          nickname: "Steve",
          type: "microsoft",
          image: "",
          friends: [],
          accessToken: token,
          refreshToken: "provider-refresh",
        },
      ],
      lastPlayed: "microsoft_Steve",
    });
  }

  it("treats a missing file as an empty store", async () => {
    expect(await readAccountsConfig()).toBeNull();
    expect(await loadAccountsConfig()).toEqual({
      accounts: [],
      lastPlayed: null,
    });
  });

  it("refuses to save when accounts.json cannot be parsed", async () => {
    await seedOneAccount();
    const secretsBefore = await fs.readFile(secretsPath, "utf-8");
    await fs.writeFile(accountsPath, "{ broken json");

    await expect(readAccountsConfig()).rejects.toThrow();
    expect(await loadAccountsConfig()).toEqual({
      accounts: [],
      lastPlayed: null,
    });

    await expect(
      mutateAccountsConfig(() => ({
        accounts: [
          { nickname: "Alex", type: "plain", image: "", friends: [] },
        ],
        lastPlayed: "plain_Alex",
      })),
    ).rejects.toThrow();

    expect(await fs.readFile(accountsPath, "utf-8")).toBe("{ broken json");
    expect(await fs.readFile(secretsPath, "utf-8")).toBe(secretsBefore);
  });

  it("refuses to save when the secret store cannot be parsed", async () => {
    await seedOneAccount();
    const accountsBefore = await fs.readFile(accountsPath, "utf-8");
    await fs.writeFile(secretsPath, "not json at all");

    await expect(readAccountsConfig()).rejects.toThrow();

    await expect(
      mutateAccountsConfig((current) => ({
        accounts: [
          ...current.accounts,
          { nickname: "Alex", type: "plain", image: "", friends: [] },
        ],
        lastPlayed: "plain_Alex",
      })),
    ).rejects.toThrow();

    expect(await fs.readFile(accountsPath, "utf-8")).toBe(accountsBefore);
    expect(await fs.readFile(secretsPath, "utf-8")).toBe("not json at all");
  });

  it("keeps saving once the store is readable again", async () => {
    await seedOneAccount();
    await fs.writeFile(accountsPath, "{ broken json");
    await expect(mutateAccountsConfig((c) => c)).rejects.toThrow();

    await seedOneAccount();
    const read = await readAccountsConfig();
    expect(read?.accounts[0].accessToken).toBe(token);
    expect(read?.accounts[0].refreshToken).toBe("provider-refresh");
  });
});

describe("mergeIncomingAccounts", () => {
  const staleExp = Math.floor(Date.now() / 1000) + 60;
  const freshExp = Math.floor(Date.now() / 1000) + 3600;

  function account(token: string, refreshToken: string) {
    return {
      nickname: "Steve",
      type: "microsoft" as const,
      image: "",
      friends: [],
      accessToken: token,
      refreshToken,
    };
  }

  it("keeps the token refreshed in main when the renderer sends a stale copy", () => {
    const stale = makeJwt({ sub: "ms-1", exp: staleExp });
    const fresh = makeJwt({ sub: "ms-1", exp: freshExp });

    const merged = mergeIncomingAccounts(
      [account(fresh, "refresh-new")],
      [account(stale, "refresh-old")],
    );

    expect(merged[0].accessToken).toBe(fresh);
    expect(merged[0].refreshToken).toBe("refresh-new");
  });

  it("accepts a genuinely newer token from the renderer", () => {
    const stale = makeJwt({ sub: "ms-1", exp: staleExp });
    const fresh = makeJwt({ sub: "ms-1", exp: freshExp });

    const merged = mergeIncomingAccounts(
      [account(stale, "refresh-old")],
      [account(fresh, "refresh-new")],
    );

    expect(merged[0].accessToken).toBe(fresh);
    expect(merged[0].refreshToken).toBe("refresh-new");
  });

  it("does not resurrect accounts the renderer removed", () => {
    const token = makeJwt({ sub: "ms-1", exp: freshExp });

    expect(mergeIncomingAccounts([account(token, "refresh")], [])).toEqual([]);
  });

  it("leaves unrelated accounts untouched", () => {
    const first = makeJwt({ sub: "ms-1", exp: freshExp });
    const second = makeJwt({ sub: "ms-2", exp: staleExp });

    const merged = mergeIncomingAccounts(
      [account(first, "refresh-1")],
      [account(second, "refresh-2")],
    );

    expect(merged[0].accessToken).toBe(second);
  });
});
