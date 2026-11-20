import { createHash, createPublicKey, verify, type KeyObject } from "crypto";
import { createReadStream } from "fs";
import fs from "fs-extra";
import signingKeys from "./updateSigningKeys.json";

export interface SignedUpdateFile {
  url?: string;
  sha512?: string;
  signature?: string;
}

export interface SignedUpdateInfo {
  version: string;
  files?: SignedUpdateFile[];
  downloadedFile?: string;
}

export type UpdateSignatureReason = "unsigned" | "unknownFile" | "invalid";

export type UpdateSignatureCheck =
  | { ok: true; keyId: string }
  | { ok: false; reason: UpdateSignatureReason };

interface SigningKey {
  id: string;
  key: KeyObject;
}

export function updateSignatureMessage(
  version: string,
  sha512: string,
): Buffer {
  return Buffer.from(`grubie-launcher-update\n${version}\n${sha512}\n`, "utf8");
}

export function parseSigningKeys(
  entries: { id: string; spki: string }[],
): SigningKey[] {
  return entries.map((entry) => {
    const key = createPublicKey({
      key: Buffer.from(entry.spki, "base64"),
      format: "der",
      type: "spki",
    });
    if (key.asymmetricKeyType !== "ed25519") {
      throw new Error(`Update signing key ${entry.id} is not ed25519`);
    }
    return { id: entry.id, key };
  });
}

let embeddedKeys: SigningKey[] | null = null;

export function updateSigningKeys(): SigningKey[] {
  embeddedKeys ??= parseSigningKeys(signingKeys.keys);
  return embeddedKeys;
}

export function fileSha512(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha512");
    createReadStream(filePath)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("base64")));
  });
}

export function signingKeyFor(
  version: string,
  sha512: string,
  signature: string,
  keys: SigningKey[] = updateSigningKeys(),
): string | null {
  const signatureBytes = Buffer.from(signature, "base64");
  if (signatureBytes.length !== 64) return null;

  const message = updateSignatureMessage(version, sha512);
  for (const { id, key } of keys) {
    if (verify(null, message, key, signatureBytes)) return id;
  }
  return null;
}

export async function checkDownloadedUpdate(
  info: SignedUpdateInfo,
  downloadedFile: string,
  keys: SigningKey[] = updateSigningKeys(),
): Promise<UpdateSignatureCheck> {
  const sha512 = await fileSha512(downloadedFile);
  const entry = (info.files ?? []).find((file) => file.sha512 === sha512);
  if (!entry) return { ok: false, reason: "unknownFile" };
  if (typeof entry.signature !== "string" || entry.signature === "") {
    return { ok: false, reason: "unsigned" };
  }

  const keyId = signingKeyFor(info.version, sha512, entry.signature, keys);
  return keyId ? { ok: true, keyId } : { ok: false, reason: "invalid" };
}

export async function verifyDownloadedUpdate(
  info: SignedUpdateInfo,
): Promise<UpdateSignatureCheck> {
  const downloadedFile = info.downloadedFile;
  if (!downloadedFile) return { ok: false, reason: "unknownFile" };

  const verdict = await checkDownloadedUpdate(info, downloadedFile).catch(
    (): UpdateSignatureCheck => ({ ok: false, reason: "unknownFile" }),
  );
  if (!verdict.ok) await fs.remove(downloadedFile).catch(() => undefined);
  return verdict;
}
