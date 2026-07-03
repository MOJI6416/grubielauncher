import { AccountType, IAccountConf, ILocalAccount } from "@/types/Account";
import { app, safeStorage } from "electron";
import { jwtDecode } from "jwt-decode";
import fs from "fs-extra";
import path from "path";

function decodeSubject(token?: string): string | null {
  if (!token) return null;
  try {
    const sub = jwtDecode<{ sub?: string }>(token).sub;
    return typeof sub === "string" && sub.trim() !== "" ? sub : null;
  } catch {
    return null;
  }
}

type PersistedAccount = Omit<ILocalAccount, "accessToken"> & {
  accessToken?: string;
};

type PersistedAccountConf = {
  accounts: PersistedAccount[];
  lastPlayed: string | null;
};

type StoredSecret = {
  mode: "safeStorage" | "plain";
  value: string;
};

type StoredSecrets = Record<string, StoredSecret>;

const accountTypes: AccountType[] = ["microsoft", "plain", "elyby", "discord"];
const persistedAccountKeys = new Set([
  "nickname",
  "type",
  "image",
  "friends",
  "accessToken",
  "id",
]);
const persistedFriendKeys = new Set(["id", "isMuted"]);

function getLauncherDir(): string {
  return path.join(app.getPath("appData"), ".grubielauncher");
}

function getAccountsPath(): string {
  return path.join(getLauncherDir(), "accounts.json");
}

function getAccountSecretsPath(): string {
  return path.join(getLauncherDir(), "accounts.secrets.json");
}

function createEmptyConfig(): IAccountConf {
  return {
    accounts: [],
    lastPlayed: null,
  };
}

function normalizeAccountType(value: unknown): AccountType {
  return accountTypes.includes(value as AccountType)
    ? (value as AccountType)
    : "plain";
}

function normalizeLocalFriends(value: unknown): ILocalAccount["friends"] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((friend) => typeof friend?.id === "string")
    .map((friend) => ({
      id: friend.id,
      isMuted: friend.isMuted === true,
    }));
}

function normalizePersistedAccount(account: any): PersistedAccount {
  const normalized: PersistedAccount = {
    nickname: typeof account?.nickname === "string" ? account.nickname : "",
    type: normalizeAccountType(account?.type),
    image: typeof account?.image === "string" ? account.image : "",
    friends: normalizeLocalFriends(account?.friends),
  };

  if (typeof account?.id === "string" && account.id.trim() !== "") {
    normalized.id = account.id;
  }

  if (
    typeof account?.accessToken === "string" &&
    account.accessToken.trim() !== ""
  ) {
    normalized.accessToken = account.accessToken;
  }

  return normalized;
}

function hasLegacyAccountShape(account: any): boolean {
  if (!account || typeof account !== "object") return true;

  const hasExtraAccountField = Object.keys(account).some(
    (key) => !persistedAccountKeys.has(key),
  );
  const hasExtraFriendField = Array.isArray(account.friends)
    ? account.friends.some((friend) =>
        Object.keys(friend ?? {}).some((key) => !persistedFriendKeys.has(key)),
      )
    : account.friends !== undefined;

  return hasExtraAccountField || hasExtraFriendField;
}

export function getAccountKey(account: Pick<ILocalAccount, "type" | "nickname">): string {
  return `${account.type}_${account.nickname}`;
}

let accountsWriteChain: Promise<unknown> = Promise.resolve();

function withAccountsLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = accountsWriteChain.then(fn, fn);
  accountsWriteChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpFile = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    await fs.move(tmpFile, filePath, { overwrite: true });
  } catch (error) {
    await fs.remove(tmpFile).catch(() => {});
    throw error;
  }
}

function encodeSecret(value: string): StoredSecret {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      mode: "safeStorage",
      value: safeStorage.encryptString(value).toString("base64"),
    };
  }

  console.warn("safeStorage is unavailable, storing account secret in plaintext fallback.");
  return {
    mode: "plain",
    value,
  };
}

function decodeSecret(secret?: StoredSecret): string | undefined {
  if (!secret?.value) return undefined;

  try {
    if (secret.mode === "safeStorage") {
      const buffer = Buffer.from(secret.value, "base64");
      return safeStorage.decryptString(buffer);
    }

    return secret.value;
  } catch {
    return undefined;
  }
}

async function readStoredSecrets(): Promise<StoredSecrets> {
  try {
    const secretsPath = getAccountSecretsPath();
    const exists = await fs.pathExists(secretsPath);
    if (!exists) return {};

    const data = await fs.readJSON(secretsPath, "utf-8");
    return typeof data === "object" && data ? (data as StoredSecrets) : {};
  } catch {
    return {};
  }
}

function normalizeConfig(data: Partial<PersistedAccountConf> | null | undefined): PersistedAccountConf {
  const accounts = Array.isArray(data?.accounts)
    ? data.accounts.map(normalizePersistedAccount)
    : [];
  const lastPlayed = typeof data?.lastPlayed === "string" ? data.lastPlayed : null;

  return {
    accounts,
    lastPlayed,
  };
}

async function writeAccountsConfig(config: IAccountConf): Promise<void> {
  const launcherDir = getLauncherDir();
  await fs.ensureDir(launcherDir);

  const nextSecrets: StoredSecrets = {};
  const persistedAccounts: PersistedAccount[] = config.accounts.map((account) => {
    const persisted = normalizePersistedAccount(account);
    delete persisted.accessToken;

    const id = decodeSubject(account.accessToken) || account.id || undefined;
    if (id) persisted.id = id;
    else delete persisted.id;

    const { accessToken } = account;
    if (typeof accessToken === "string" && accessToken.trim() !== "") {
      nextSecrets[id ?? getAccountKey(account)] = encodeSecret(accessToken);
    }

    return persisted;
  });

  await writeJsonAtomic(getAccountSecretsPath(), nextSecrets);
  await writeJsonAtomic(getAccountsPath(), {
    accounts: persistedAccounts,
    lastPlayed: config.lastPlayed ?? null,
  } satisfies PersistedAccountConf);
}

export function saveAccountsConfig(config: IAccountConf): Promise<void> {
  return withAccountsLock(() => writeAccountsConfig(config));
}

export function readAccountsConfig(): Promise<IAccountConf | null> {
  return withAccountsLock(readAccountsConfigInner);
}

async function readAccountsConfigInner(): Promise<IAccountConf | null> {
  try {
    const accountsPath = getAccountsPath();
    const exists = await fs.pathExists(accountsPath);
    if (!exists) return null;

    const data = await fs.readJSON(accountsPath, "utf-8");
    const hasLegacyShape = Array.isArray(data?.accounts)
      ? data.accounts.some(hasLegacyAccountShape)
      : false;
    const raw = normalizeConfig(data);
    const secrets = await readStoredSecrets();

    let shouldMigrate = false;
    const hydratedAccounts = raw.accounts.map((account) => {
      const legacyKey = getAccountKey(account);
      const idKey = account.id;

      const idSecret = idKey ? secrets[idKey] : undefined;
      const legacySecret = secrets[legacyKey];

      let accessToken = decodeSecret(idSecret) ?? decodeSecret(legacySecret);

      if (
        !accessToken &&
        typeof account.accessToken === "string" &&
        account.accessToken.trim() !== ""
      ) {
        accessToken = account.accessToken;
        shouldMigrate = true;
      }

      if (accessToken && !idSecret && legacySecret) shouldMigrate = true;

      const resolvedId = decodeSubject(accessToken) || idKey || undefined;
      if (resolvedId && resolvedId !== idKey) shouldMigrate = true;

      const hydrated: ILocalAccount = { ...account };
      if (resolvedId) hydrated.id = resolvedId;
      if (accessToken) hydrated.accessToken = accessToken;

      return hydrated;
    });

    const config: IAccountConf = {
      accounts: hydratedAccounts,
      lastPlayed: raw.lastPlayed,
    };

    if (
      shouldMigrate ||
      hasLegacyShape ||
      raw.accounts.some((account) => typeof account.accessToken === "string" && account.accessToken.trim() !== "")
    ) {
      await writeAccountsConfig(config);
    }

    return config;
  } catch {
    return null;
  }
}

export function mutateAccountsConfig(
  mutator: (
    config: IAccountConf,
  ) => IAccountConf | null | Promise<IAccountConf | null>,
): Promise<IAccountConf | null> {
  return withAccountsLock(async () => {
    const current = (await readAccountsConfigInner()) ?? createEmptyConfig();
    const next = await mutator(current);
    if (next) await writeAccountsConfig(next);
    return next;
  });
}

export async function loadAccountsConfig(): Promise<IAccountConf> {
  return (await readAccountsConfig()) ?? createEmptyConfig();
}

export async function getSelectedAccount(): Promise<ILocalAccount | null> {
  const config = await readAccountsConfig();
  if (!config?.accounts?.length) return null;

  if (config.lastPlayed) {
    const selected = config.accounts.find(
      (account) => getAccountKey(account) === config.lastPlayed,
    );
    if (selected) return selected;
  }

  return config.accounts[0] ?? null;
}

export async function getSelectedAccessToken(): Promise<string | null> {
  const selected = await getSelectedAccount();
  if (!selected?.accessToken) return null;
  return selected.accessToken;
}
