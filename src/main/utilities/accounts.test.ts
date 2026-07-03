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
