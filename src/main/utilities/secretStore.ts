import { safeStorage } from "electron";

export type StoredSecret = {
  mode: "safeStorage" | "plain";
  value: string;
};

export type StoredSecrets = Record<string, StoredSecret>;

export function encodeSecret(value: string, label = "secret"): StoredSecret {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      mode: "safeStorage",
      value: safeStorage.encryptString(value).toString("base64"),
    };
  }

  console.warn(
    `safeStorage is unavailable, storing ${label} in plaintext fallback.`,
  );
  return {
    mode: "plain",
    value,
  };
}

export function decodeSecret(secret?: StoredSecret): string | undefined {
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
