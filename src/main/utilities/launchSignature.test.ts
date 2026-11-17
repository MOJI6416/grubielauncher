import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeLaunchSignature,
  isSignedLaunchServer,
  launchSignaturePayload,
  matchesLaunchSignature,
  signLaunchServer,
} from "./launchSignature";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "launch-sig-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.remove(dir)));
});

describe("launch link signatures", () => {
  it("accepts only the signature made with the same secret and target", () => {
    const secret = Buffer.alloc(32, 7);
    const payload = launchSignaturePayload("Better MC", 0, "play.example.net");
    const signature = computeLaunchSignature(secret, payload);

    expect(matchesLaunchSignature(secret, payload, signature)).toBe(true);
    expect(
      matchesLaunchSignature(
        secret,
        launchSignaturePayload("Better MC", 0, "evil.example.net"),
        signature,
      ),
    ).toBe(false);
    expect(
      matchesLaunchSignature(
        secret,
        launchSignaturePayload("Better MC", 1, "play.example.net"),
        signature,
      ),
    ).toBe(false);
    expect(matchesLaunchSignature(Buffer.alloc(32, 8), payload, signature)).toBe(
      false,
    );
  });

  it("rejects missing and malformed signatures", () => {
    const secret = Buffer.alloc(32, 1);
    const payload = launchSignaturePayload("Pack", 0, "host");
    expect(matchesLaunchSignature(secret, payload, undefined)).toBe(false);
    expect(matchesLaunchSignature(secret, payload, "abc")).toBe(false);
    expect(matchesLaunchSignature(secret, payload, "Z".repeat(64))).toBe(false);
  });

  it("keeps one secret per data folder across calls", async () => {
    const dir = await tempDir();
    const signature = await signLaunchServer(dir, "Pack", 2, "mc.example.org");

    expect(await isSignedLaunchServer(dir, "Pack", 2, "mc.example.org", signature)).toBe(
      true,
    );
    expect(await isSignedLaunchServer(dir, "Pack", 2, "other.org", signature)).toBe(
      false,
    );

    const other = await tempDir();
    expect(
      await isSignedLaunchServer(other, "Pack", 2, "mc.example.org", signature),
    ).toBe(false);
  });
});
