import { IAccountConf, ILocalAccount } from "@/types/Account";
import { app, safeStorage } from "electron";
import fs from "fs-extra";
import path from "path";

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

export function getAccountKey(account: Pick<ILocalAccount, "type" | "nickname">): string {
  return `${account.type}_${account.nickname}`;
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpFile = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), "utf-8");
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
  const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
  const lastPlayed = typeof data?.lastPlayed === "string" ? data.lastPlayed : null;

  return {
    accounts,
    lastPlayed,
  };
}

export async function saveAccountsConfig(config: IAccountConf): Promise<void> {
  const launcherDir = getLauncherDir();
  await fs.ensureDir(launcherDir);

  const nextSecrets: StoredSecrets = {};
  const persistedAccounts: PersistedAccount[] = config.accounts.map((account) => {
    const { accessToken, ...persisted } = account;
    if (typeof accessToken === "string" && accessToken.trim() !== "") {
      nextSecrets[getAccountKey(account)] = encodeSecret(accessToken);
    }

    return persisted;
  });

  await writeJsonAtomic(getAccountSecretsPath(), nextSecrets);
  await writeJsonAtomic(getAccountsPath(), {
    accounts: persistedAccounts,
    lastPlayed: config.lastPlayed ?? null,
  } satisfies PersistedAccountConf);
}

export async function readAccountsConfig(): Promise<IAccountConf | null> {
  try {
    const accountsPath = getAccountsPath();
    const exists = await fs.pathExists(accountsPath);
    if (!exists) return null;

    const raw = normalizeConfig(await fs.readJSON(accountsPath, "utf-8"));
    const secrets = await readStoredSecrets();

    let shouldMigrate = false;
    const hydratedAccounts = raw.accounts.map((account) => {
      const accountKey = getAccountKey(account);
      let accessToken = decodeSecret(secrets[accountKey]);

      if (!accessToken && typeof account.accessToken === "string" && account.accessToken.trim() !== "") {
        accessToken = account.accessToken;
        shouldMigrate = true;
      }

      return accessToken ? { ...account, accessToken } : { ...account };
    });

    const config: IAccountConf = {
      accounts: hydratedAccounts,
      lastPlayed: raw.lastPlayed,
    };

    if (
      shouldMigrate ||
      raw.accounts.some((account) => typeof account.accessToken === "string" && account.accessToken.trim() !== "")
    ) {
      await saveAccountsConfig(config);
    }

    return config;
  } catch {
    return null;
  }
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
