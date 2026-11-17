import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";

const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/;
const SECRET_FILE = "launch-link.key";

export function isLaunchSignatureShape(value: unknown): value is string {
  return typeof value === "string" && SIGNATURE_PATTERN.test(value);
}

export function launchSignaturePayload(
  versionName: string,
  instance: number,
  server: string,
): string {
  return `${versionName}\n${instance}\n${server}`;
}

export function computeLaunchSignature(secret: Buffer, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function matchesLaunchSignature(
  secret: Buffer,
  payload: string,
  signature: string | undefined,
): boolean {
  if (!isLaunchSignatureShape(signature)) return false;
  const expected = Buffer.from(computeLaunchSignature(secret, payload), "hex");
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

const secrets = new Map<string, Promise<Buffer>>();

async function readOrCreateSecret(dir: string): Promise<Buffer> {
  const file = path.join(dir, SECRET_FILE);
  try {
    const stored = (await fs.readFile(file, "utf8")).trim();
    if (SIGNATURE_PATTERN.test(stored)) return Buffer.from(stored, "hex");
  } catch {}
  const secret = crypto.randomBytes(32);
  await fs.outputFile(file, secret.toString("hex"), { mode: 0o600 });
  return secret;
}

export function loadLaunchSecret(dir: string): Promise<Buffer> {
  let pending = secrets.get(dir);
  if (!pending) {
    pending = readOrCreateSecret(dir).catch((error) => {
      secrets.delete(dir);
      throw error;
    });
    secrets.set(dir, pending);
  }
  return pending;
}

export async function signLaunchServer(
  dir: string,
  versionName: string,
  instance: number,
  server: string,
): Promise<string> {
  const secret = await loadLaunchSecret(dir);
  return computeLaunchSignature(
    secret,
    launchSignaturePayload(versionName, instance, server),
  );
}

export async function isSignedLaunchServer(
  dir: string,
  versionName: string,
  instance: number,
  server: string,
  signature: string | undefined,
): Promise<boolean> {
  if (!isLaunchSignatureShape(signature)) return false;
  try {
    const secret = await loadLaunchSecret(dir);
    return matchesLaunchSignature(
      secret,
      launchSignaturePayload(versionName, instance, server),
      signature,
    );
  } catch {
    return false;
  }
}
