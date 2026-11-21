import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertModVersion,
  buildManifest,
  compareVersions,
  jarUrl,
  releaseAssetUrl,
  signManifest,
  uniqueJars,
  validateManifest,
  validateTargets,
  verifyEnvelope
} from "./companion-release.mjs";
import { loadPublicKeys, publicKeys } from "./update-signing.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "companion-release.mjs");

function keyPair(id) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { id, privateKey, entry: { id, spki: publicKey.export({ type: "spki", format: "der" }).toString("base64") } };
}

const primary = keyPair("primary");
const reserve = keyPair("reserve");
const stranger = keyPair("stranger");
const keys = publicKeys([primary.entry, reserve.entry]);
const NOW = new Date("2026-11-21T12:00:00.123Z");

function targets(version, files) {
  return { mod: version, protocol: 2, files };
}

function hashes(...names) {
  return new Map(names.map((name) => [name, { sha256: createHash("sha256").update(name).digest("hex"), size: name.length }]));
}

const FABRIC = "grubie-companion-2.0.0+fabric-1.20.1.jar";
const NEOFORGE = "grubie-companion-2.0.0+neoforge-1.21.1.jar";

const first = buildManifest({
  targets: targets("2.0.0", [
    { file: FABRIC, loader: "fabric", minecraft: ["1.20", "1.20.1"] },
    { file: NEOFORGE, loader: "neoforge", minecraft: ["1.21.1"] }
  ]),
  jars: hashes(FABRIC, NEOFORGE),
  now: NOW
});

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, UPDATE_SIGNING_PASSPHRASE: "" } });
}

test("builds the first manifest from targets.json", () => {
  assert.equal(first.sequence, 1);
  assert.equal(first.published, "2026-11-21T12:00:00Z");
  assert.deepEqual(Object.keys(first.mods["2.0.0"].minecraft).sort(), ["1.20", "1.20.1", "1.21.1"]);
  assert.equal(first.mods["2.0.0"].minecraft["1.20"].fabric.url, "https://cdn.grubielauncher.com/companion/2.0.0/grubie-companion-2.0.0%2Bfabric-1.20.1.jar");
  assert.deepEqual(validateManifest(first), []);
  assert.deepEqual(uniqueJars(first).map((jar) => jar.key).sort(), [
    "companion/2.0.0/grubie-companion-2.0.0+fabric-1.20.1.jar",
    "companion/2.0.0/grubie-companion-2.0.0+neoforge-1.21.1.jar"
  ]);
});

test("merges the previous versions, keeps the newest and bumps the sequence", () => {
  const release = (version) => {
    const file = `grubie-companion-${version}+fabric-1.21.1.jar`;
    return { targets: targets(version, [{ file, loader: "fabric", minecraft: ["1.21.1"] }]), jars: hashes(file) };
  };
  const next = buildManifest({ ...release("2.1.0"), previous: { ...first, sequence: 7 }, now: NOW });
  assert.equal(next.sequence, 8);
  assert.deepEqual(Object.keys(next.mods), ["2.1.0", "2.0.0"]);

  const later = buildManifest({ ...release("10.0.0"), previous: buildManifest({ ...release("2.2.0"), previous: next }), keep: 2 });
  assert.deepEqual(Object.keys(later.mods), ["10.0.0", "2.2.0"]);
  assert.equal(later.sequence, 10);

  assert.throws(() => buildManifest({ ...release("1.0.0"), previous: later, keep: 2 }), /--keep/);
  assert.throws(
    () => buildManifest({ targets: targets("2.0.0", [{ file: FABRIC, loader: "fabric", minecraft: ["1.20.1"] }]), jars: hashes("other"), previous: first }),
    /не посчитан/
  );
  const changed = new Map([[FABRIC, { sha256: "0".repeat(64), size: 3 }]]);
  assert.throws(
    () => buildManifest({ targets: targets("2.0.0", [{ file: FABRIC, loader: "fabric", minecraft: ["1.20.1"] }]), jars: changed, previous: first }),
    /не меняются/
  );
  const same = buildManifest({
    targets: targets("2.0.0", [
      { file: FABRIC, loader: "fabric", minecraft: ["1.20", "1.20.1"] },
      { file: NEOFORGE, loader: "neoforge", minecraft: ["1.21.1"] }
    ]),
    jars: hashes(FABRIC, NEOFORGE),
    previous: first
  });
  assert.equal(same.sequence, 2);
});

test("refuses two jars for one loader and Minecraft version", () => {
  const other = "grubie-companion-2.0.0+fabric-other.jar";
  assert.throws(
    () =>
      buildManifest({
        targets: targets("2.0.0", [
          { file: FABRIC, loader: "fabric", minecraft: ["1.20.1"] },
          { file: other, loader: "fabric", minecraft: ["1.20.1"] }
        ]),
        jars: hashes(FABRIC, other)
      }),
    /Два файла/
  );
});

test("checks targets.json", () => {
  assert.deepEqual(validateTargets(targets("2.0.0", [{ file: FABRIC, loader: "fabric", minecraft: ["1.20.1"] }]), "2.0.0"), []);
  assert.equal(validateTargets(targets("2.0.0", [{ file: "../x.jar", loader: "fabric", minecraft: ["1.20.1"] }]), "2.0.0").length, 1);
  assert.equal(validateTargets(targets("2.0.0", [{ file: FABRIC, loader: "constructor!", minecraft: ["__proto__"] }]), "2.0.0").length, 2);
  assert.equal(validateTargets(targets("2.0.1", []), "2.0.0").length, 2);
  const forge = "grubie-companion-2.0.0+forge-1.20.1.jar";
  assert.deepEqual(
    validateTargets(targets("2.0.0", [{ file: forge, loader: "forge", minecraft: ["1.20.1"] }, { file: forge, loader: "neoforge", minecraft: ["1.20.1"] }]), "2.0.0"),
    []
  );
  assert.equal(
    validateTargets(targets("2.0.0", [{ file: forge, loader: "forge", minecraft: ["1.20.1"] }, { file: forge, loader: "forge", minecraft: ["1.20.2"] }]), "2.0.0").length,
    1
  );
});

test("signs and verifies a manifest with either key", () => {
  const envelope = signManifest(first, primary.privateKey, "primary");
  const result = verifyEnvelope(envelope, keys);
  assert.equal(result.ok, true);
  assert.equal(result.keyId, "primary");
  assert.deepEqual(result.manifest, JSON.parse(JSON.stringify(first)));

  assert.equal(verifyEnvelope(signManifest(first, reserve.privateKey, "primary"), keys).keyId, "reserve");
  assert.equal(verifyEnvelope(signManifest(first, stranger.privateKey, "primary"), keys).ok, false);
  assert.equal(verifyEnvelope({ ...envelope, signed: envelope.signed.replace('"sequence":1', '"sequence":2') }, keys).ok, false);
  assert.equal(verifyEnvelope({ keyId: "primary", signature: envelope.signature }, keys).ok, false);
});

test("a signed but malformed manifest does not verify", () => {
  const bad = structuredClone(first);
  bad.mods["2.0.0"].minecraft["1.20.1"].fabric.url = "https://evil.example/x.jar";
  bad.mods["2.0.0"].minecraft["1.21.1"].neoforge.file = "grubie-companion-2.0.0/../x.jar";
  const result = verifyEnvelope(signManifest(bad, primary.privateKey, "primary"), keys);
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 3);
  assert.match(result.problems.join("\n"), /1\.20\.1: url "https:\/\/evil\.example\/x\.jar"/);
  assert.match(result.problems.join("\n"), /"grubie-companion-2\.0\.0\/\.\.\/x\.jar" не разрешено/);
  assert.equal(verifyEnvelope(signManifest({ ...first, format: 2 }, primary.privateKey, "primary"), keys).ok, false);
});

test("accepts the jar url with a literal plus too", () => {
  const plain = structuredClone(first);
  plain.mods["2.0.0"].minecraft["1.20.1"].fabric.url = `https://cdn.grubielauncher.com/companion/2.0.0/${FABRIC}`;
  assert.deepEqual(validateManifest(plain), []);
  plain.mods["2.0.0"].minecraft["1.20.1"].fabric.url = jarUrl("2.1.0", FABRIC);
  assert.equal(validateManifest(plain).length, 1);
});

test("orders versions like semver", () => {
  const sorted = ["2.0.0", "10.0.0", "2.0.0-beta.2", "2.0.0-beta.10", "2.0.0-alpha", "1.9.9"].sort(compareVersions);
  assert.deepEqual(sorted, ["1.9.9", "2.0.0-alpha", "2.0.0-beta.2", "2.0.0-beta.10", "2.0.0", "10.0.0"]);
});

test("downloads only from the mod's public GitHub release", () => {
  assert.equal(
    releaseAssetUrl("2.0.0", FABRIC),
    "https://github.com/MOJI6416/grubie-companion/releases/download/v2.0.0/grubie-companion-2.0.0%2Bfabric-1.20.1.jar"
  );
  assert.equal(releaseAssetUrl("2.0.0", "targets.json"), "https://github.com/MOJI6416/grubie-companion/releases/download/v2.0.0/targets.json");
  assert.equal(assertModVersion("2.1.0-beta.1"), "2.1.0-beta.1");
  for (const bad of ["v2.0.0", "2.0", "2.0.0; rm -rf /", "../2.0.0", "", undefined]) {
    assert.throws(() => assertModVersion(bad), /semver/);
  }
});

test("prepares from downloaded files and refuses a key the launcher does not know", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "companion-release-test-"));
  try {
    const versionDir = path.join(dir, "2.0.0");
    fs.mkdirSync(versionDir);
    fs.writeFileSync(path.join(versionDir, FABRIC), "fabric jar");
    fs.writeFileSync(
      path.join(versionDir, "targets.json"),
      JSON.stringify(targets("2.0.0", [{ file: FABRIC, loader: "fabric", minecraft: ["1.20.1"] }]))
    );

    const prepared = run("prepare", "2.0.0", "--dir", dir, "--previous", "none");
    assert.equal(prepared.status, 0, prepared.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.unsigned.json"), "utf8"));
    assert.equal(manifest.sequence, 1);
    assert.equal(manifest.mods["2.0.0"].minecraft["1.20.1"].fabric.sha256, createHash("sha256").update("fabric jar").digest("hex"));
    assert.equal(manifest.mods["2.0.0"].minecraft["1.20.1"].fabric.size, "fabric jar".length);

    const keyFile = path.join(dir, "stranger.pem");
    fs.writeFileSync(keyFile, stranger.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    const signed = run("sign", "--dir", dir, "--key", keyFile);
    assert.equal(signed.status, 1);
    assert.match(signed.stderr, /not listed/);
    assert.equal(fs.existsSync(path.join(dir, "manifest.json")), false);

    const wrongVersion = run("prepare", "2.0.1", "--dir", dir, "--previous", "none");
    assert.equal(wrongVersion.status, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checks against the launcher's own update keys", () => {
  assert.deepEqual(
    loadPublicKeys().map(({ id }) => id),
    ["primary", "reserve"]
  );
});
