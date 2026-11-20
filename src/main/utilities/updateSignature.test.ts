import { createHash, generateKeyPairSync, sign } from "crypto";
import os from "os";
import path from "path";
import fs from "fs-extra";
import { load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkDownloadedUpdate,
  parseSigningKeys,
  updateSignatureMessage,
  updateSigningKeys,
  verifyDownloadedUpdate,
} from "./updateSignature";
import {
  parseUpdateYml,
  publicKeys,
  signatureMessage,
  signUpdateYml,
  verifyUpdateYml,
} from "../../../.github/scripts/update-signing.mjs";

function keyPair(id: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const spki = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  return { id, privateKey, entry: { id, spki } };
}

function sha512(data: Buffer): string {
  return createHash("sha512").update(data).digest("base64");
}

const VERSION = "2.2.7";
const primary = keyPair("primary");
const reserve = keyPair("reserve");
const stranger = keyPair("stranger");
const keys = parseSigningKeys([primary.entry, reserve.entry]);

let dir = "";
let installer = "";
let installerBytes = Buffer.alloc(0);

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-update-signature-"));
  installer = path.join(dir, "grubie-launcher-2.2.7-setup.exe");
  installerBytes = Buffer.from(`installer ${Math.random()}`);
  await fs.writeFile(installer, installerBytes);
});

afterEach(async () => {
  await fs.remove(dir);
});

function signedEntry(signer = primary, version = VERSION) {
  const hash = sha512(installerBytes);
  return {
    url: path.basename(installer),
    sha512: hash,
    signature: sign(
      null,
      updateSignatureMessage(version, hash),
      signer.privateKey,
    ).toString("base64"),
  };
}

describe("checkDownloadedUpdate", () => {
  it("accepts an installer signed with the primary or the reserve key", async () => {
    expect(
      await checkDownloadedUpdate(
        { version: VERSION, files: [signedEntry(primary)] },
        installer,
        keys,
      ),
    ).toEqual({ ok: true, keyId: "primary" });
    expect(
      await checkDownloadedUpdate(
        { version: VERSION, files: [signedEntry(reserve)] },
        installer,
        keys,
      ),
    ).toEqual({ ok: true, keyId: "reserve" });
  });

  it("rejects an update without a signature", async () => {
    const { signature: _signature, ...unsigned } = signedEntry();
    expect(
      await checkDownloadedUpdate(
        { version: VERSION, files: [unsigned] },
        installer,
        keys,
      ),
    ).toEqual({ ok: false, reason: "unsigned" });
  });

  it("rejects a signature made with a key the launcher does not know", async () => {
    expect(
      await checkDownloadedUpdate(
        { version: VERSION, files: [signedEntry(stranger)] },
        installer,
        keys,
      ),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a signature made for another version", async () => {
    expect(
      await checkDownloadedUpdate(
        { version: VERSION, files: [signedEntry(primary, "2.2.6")] },
        installer,
        keys,
      ),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a downloaded file that differs from every listed hash", async () => {
    const entry = signedEntry();
    await fs.writeFile(installer, Buffer.from("replaced installer"));
    expect(
      await checkDownloadedUpdate(
        { version: VERSION, files: [entry] },
        installer,
        keys,
      ),
    ).toEqual({ ok: false, reason: "unknownFile" });
  });

  it("rejects a malformed signature", async () => {
    expect(
      await checkDownloadedUpdate(
        {
          version: VERSION,
          files: [{ ...signedEntry(), signature: "bm90IGEgc2lnbmF0dXJl" }],
        },
        installer,
        keys,
      ),
    ).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("verifyDownloadedUpdate", () => {
  it("deletes a rejected download so it is never installed from the cache", async () => {
    const verdict = await verifyDownloadedUpdate({
      version: VERSION,
      files: [{ url: "x.exe", sha512: "AAAA", signature: "AAAA" }],
      downloadedFile: installer,
    });

    expect(verdict.ok).toBe(false);
    expect(await fs.pathExists(installer)).toBe(false);
  });
});

describe("embedded launcher keys", () => {
  it("are ed25519 public keys with distinct ids", () => {
    const embedded = updateSigningKeys();
    expect(embedded.length).toBeGreaterThanOrEqual(2);
    expect(new Set(embedded.map((key) => key.id)).size).toBe(embedded.length);
    for (const { key } of embedded) {
      expect(key.asymmetricKeyType).toBe("ed25519");
    }
  });
});

const WINDOWS_YML = [
  "version: 2.2.7",
  "files:",
  "  - url: grubie-launcher-2.2.7-setup.exe",
  "    sha512: SHA_EXE",
  "path: grubie-launcher-2.2.7-setup.exe",
  "sha512: SHA_EXE",
  "releaseDate: '2026-11-20T04:18:52.055Z'",
  "",
].join("\n");

const MAC_YML = [
  "version: 2.2.7",
  "files:",
  "  - url: grubie-launcher-2.2.7-arm64.zip",
  "    sha512: SHA_ZIP",
  "    size: 120000000",
  "  - url: grubie-launcher-2.2.7-arm64.dmg",
  "    sha512: SHA_DMG",
  "    size: 125000000",
  "    blockMapSize: 130000",
  "path: grubie-launcher-2.2.7-arm64.zip",
  "sha512: SHA_ZIP",
  "releaseDate: '2026-11-20T04:18:52.055Z'",
  "",
].join("\n");

describe("update-signing script", () => {
  it("builds the same message the launcher verifies", () => {
    expect(
      signatureMessage(VERSION, "abc").equals(
        updateSignatureMessage(VERSION, "abc"),
      ),
    ).toBe(true);
  });

  it("signs a Windows channel file that electron-updater still parses and the launcher accepts", async () => {
    const yml = WINDOWS_YML.replace(/SHA_EXE/g, sha512(installerBytes));
    const signed = signUpdateYml(yml, primary.privateKey);
    const parsed = load(signed) as {
      version: string;
      path: string;
      releaseDate: string;
      files: { url: string; sha512: string; signature: string }[];
    };

    expect(parsed.version).toBe(VERSION);
    expect(parsed.path).toBe("grubie-launcher-2.2.7-setup.exe");
    expect(parsed.releaseDate).toBe("2026-11-20T04:18:52.055Z");
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].signature).toMatch(/^[A-Za-z0-9+/]{86}==$/);
    expect(await checkDownloadedUpdate(parsed, installer, keys)).toEqual({
      ok: true,
      keyId: "primary",
    });
  });

  it("signs every file of a channel file with extra fields", () => {
    const signed = signUpdateYml(MAC_YML, reserve.privateKey);
    const parsed = load(signed) as {
      files: {
        url: string;
        size: number;
        blockMapSize?: number;
        signature: string;
      }[];
    };

    expect(parsed.files.map((file) => file.url)).toEqual([
      "grubie-launcher-2.2.7-arm64.zip",
      "grubie-launcher-2.2.7-arm64.dmg",
    ]);
    expect(parsed.files[1].blockMapSize).toBe(130000);
    expect(parsed.files.every((file) => file.signature.length === 88)).toBe(
      true,
    );
    expect(parseUpdateYml(signed).files).toEqual(
      parsed.files.map((file) => ({
        ...file,
        size: String(file.size),
        ...(file.blockMapSize
          ? { blockMapSize: String(file.blockMapSize) }
          : {}),
      })),
    );
    expect(
      verifyUpdateYml(
        signed,
        publicKeys([primary.entry, reserve.entry]),
        VERSION,
      ),
    ).toEqual({
      ok: true,
      problems: [],
    });
  });

  it("replaces an old signature instead of adding a second one", () => {
    const once = signUpdateYml(WINDOWS_YML, stranger.privateKey);
    const twice = signUpdateYml(once, primary.privateKey);

    expect(twice.match(/signature:/g)).toHaveLength(1);
    expect(
      verifyUpdateYml(twice, publicKeys([primary.entry]), VERSION).ok,
    ).toBe(true);
  });

  it("reports unsigned files, foreign signatures and a wrong version", () => {
    const launcherKeys = publicKeys([primary.entry, reserve.entry]);

    expect(
      verifyUpdateYml(WINDOWS_YML, launcherKeys, VERSION).problems,
    ).toEqual(["grubie-launcher-2.2.7-setup.exe: not signed"]);
    expect(
      verifyUpdateYml(
        signUpdateYml(WINDOWS_YML, stranger.privateKey),
        launcherKeys,
        VERSION,
      ).problems,
    ).toEqual([
      "grubie-launcher-2.2.7-setup.exe: signature does not match any launcher key",
    ]);
    expect(
      verifyUpdateYml(
        signUpdateYml(WINDOWS_YML, primary.privateKey),
        launcherKeys,
        "2.2.8",
      ).problems,
    ).toEqual(["version 2.2.7 instead of 2.2.8"]);
  });
});
