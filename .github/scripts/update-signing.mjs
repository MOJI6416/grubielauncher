import { execFileSync } from "node:child_process";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify
} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEYS_FILE = path.join(ROOT, "src", "main", "utilities", "updateSigningKeys.json");
const REPO = process.env.GITHUB_REPOSITORY || "MOJI6416/grubielauncher";
const CHANNEL_FILE = /^latest(-[a-z0-9]+)?\.yml$/i;

export function signatureMessage(version, sha512) {
  return Buffer.from(`grubie-launcher-update\n${version}\n${sha512}\n`, "utf8");
}

function unquote(raw) {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value);
  }
  return value;
}

function scanUpdateYml(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let version = null;
  let inFiles = false;
  let current = null;

  lines.forEach((line, index) => {
    if (/^\S/.test(line)) {
      inFiles = false;
      if (current) current.end = index;
      current = null;
      const top = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (top?.[1] === "version") version = unquote(top[2]);
      if (top?.[1] === "files" && top[2].trim() === "") inFiles = true;
      return;
    }
    if (!inFiles) return;

    const start = line.match(/^ {2}- ([A-Za-z0-9_]+):\s*(.*)$/);
    if (start) {
      if (current) current.end = index;
      current = { start: index, end: lines.length, fields: { [start[1]]: unquote(start[2]) }, lines: { [start[1]]: index } };
      items.push(current);
      return;
    }

    const field = line.match(/^ {4}([A-Za-z0-9_]+):\s*(.*)$/);
    if (field && current) {
      current.fields[field[1]] = unquote(field[2]);
      current.lines[field[1]] = index;
    }
  });

  if (current) {
    let end = lines.length;
    while (end > current.start + 1 && lines[end - 1].trim() === "") end -= 1;
    current.end = Math.min(current.end, end);
  }

  return { lines, version, items };
}

export function parseUpdateYml(text) {
  const { version, items } = scanUpdateYml(text);
  return { version, files: items.map((item) => ({ ...item.fields })) };
}

export function signUpdateYml(text, privateKey) {
  const { lines, version, items } = scanUpdateYml(text);
  if (!version) throw new Error("The update file has no version");
  if (items.length === 0) throw new Error("The update file lists no files");

  const output = [...lines];
  for (const item of [...items].reverse()) {
    const sha512 = item.fields.sha512;
    if (!sha512) throw new Error(`${item.fields.url ?? "A file"} has no sha512`);

    const signature = sign(null, signatureMessage(version, sha512), privateKey).toString("base64");
    const signatureLine = `    signature: ${signature}`;
    if (item.lines.signature !== undefined) {
      output[item.lines.signature] = signatureLine;
    } else {
      output.splice(item.end, 0, signatureLine);
    }
  }

  return output.join(text.includes("\r\n") ? "\r\n" : "\n");
}

export function publicKeys(entries) {
  return entries.map((entry) => ({
    id: entry.id,
    key: createPublicKey({ key: Buffer.from(entry.spki, "base64"), format: "der", type: "spki" })
  }));
}

export function loadPublicKeys() {
  return publicKeys(JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")).keys);
}

export function verifyUpdateYml(text, keys, expectedVersion) {
  const { version, files } = parseUpdateYml(text);
  const problems = [];

  if (!version) problems.push("no version");
  if (expectedVersion && version !== expectedVersion) {
    problems.push(`version ${version} instead of ${expectedVersion}`);
  }
  if (files.length === 0) problems.push("no files");

  for (const file of files) {
    const name = file.url ?? "?";
    if (!file.sha512) {
      problems.push(`${name}: no sha512`);
      continue;
    }
    if (!file.signature) {
      problems.push(`${name}: not signed`);
      continue;
    }
    const signature = Buffer.from(file.signature, "base64");
    const message = signatureMessage(version ?? "", file.sha512);
    const signer = keys.find(({ key }) => signature.length === 64 && verify(null, message, key, signature));
    if (!signer) problems.push(`${name}: signature does not match any launcher key`);
  }

  return { ok: problems.length === 0, problems };
}

export function readPrivateKey(keyPath) {
  const passphrase = process.env.UPDATE_SIGNING_PASSPHRASE || undefined;
  const key = createPrivateKey({ key: fs.readFileSync(keyPath), passphrase });
  if (key.asymmetricKeyType !== "ed25519") throw new Error(`${keyPath} is not an ed25519 key`);
  return key;
}

export function assertKnownKey(privateKey) {
  const spki = createPublicKey(privateKey).export({ type: "spki", format: "der" }).toString("base64");
  const known = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")).keys.find((entry) => entry.spki === spki);
  if (!known) {
    throw new Error(`This key is not listed in ${path.relative(ROOT, KEYS_FILE)}: launchers would reject what it signs`);
  }
  return known.id;
}

function gh(args, options = {}) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...options });
}

function releaseChannelFiles(version, repo) {
  const release = JSON.parse(gh(["release", "view", version, "--repo", repo, "--json", "assets"]));
  return release.assets.map((asset) => asset.name).filter((name) => CHANNEL_FILE.test(name));
}

function downloadChannelFiles(version, repo) {
  const names = releaseChannelFiles(version, repo);
  if (names.length === 0) throw new Error(`Release ${version} has no latest*.yml`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grubie-update-signing-"));
  for (const name of names) {
    gh(["release", "download", version, "--repo", repo, "--pattern", name, "--dir", dir, "--clobber"]);
  }
  return { dir, files: names.map((name) => path.join(dir, name)) };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function positional(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      index += 1;
      continue;
    }
    values.push(args[index]);
  }
  return values;
}

function keygen(dir) {
  if (!dir) throw new Error("Usage: keygen <folder outside the repository>");
  if (path.resolve(dir).startsWith(ROOT)) throw new Error("Keep private keys outside the repository");

  fs.mkdirSync(dir, { recursive: true });
  const passphrase = process.env.UPDATE_SIGNING_PASSPHRASE || undefined;
  const entries = [];
  for (const id of ["primary", "reserve"]) {
    const file = path.join(dir, `update-signing-${id}.pem`);
    if (fs.existsSync(file)) throw new Error(`${file} already exists`);

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    fs.writeFileSync(
      file,
      privateKey.export({ type: "pkcs8", format: "pem", ...(passphrase ? { cipher: "aes-256-cbc", passphrase } : {}) }),
      { mode: 0o600 }
    );
    entries.push({ id, spki: publicKey.export({ type: "spki", format: "der" }).toString("base64") });
    console.log(`Wrote ${file}`);
  }
  console.log(`\nPut this into ${path.relative(ROOT, KEYS_FILE)}:\n${JSON.stringify({ keys: entries }, null, 2)}`);
}

function signFiles(version, keyPath, files) {
  const privateKey = readPrivateKey(keyPath);
  const keyId = assertKnownKey(privateKey);
  const keys = loadPublicKeys();

  for (const file of files) {
    const signed = signUpdateYml(fs.readFileSync(file, "utf8"), privateKey);
    const result = verifyUpdateYml(signed, keys, version);
    if (!result.ok) throw new Error(`${path.basename(file)}: ${result.problems.join("; ")}`);
    fs.writeFileSync(file, signed);
    console.log(`Signed ${path.basename(file)} with the ${keyId} key`);
  }
}

function verifyFiles(version, files) {
  const keys = loadPublicKeys();
  let ok = true;
  for (const file of files) {
    const result = verifyUpdateYml(fs.readFileSync(file, "utf8"), keys, version);
    if (result.ok) {
      console.log(`${path.basename(file)}: signed`);
      continue;
    }
    ok = false;
    for (const problem of result.problems) console.error(`${path.basename(file)}: ${problem}`);
  }
  return ok;
}

function main(argv) {
  const [command, ...args] = argv;
  const repo = option(args, "--repo") || REPO;
  const [version, ...rest] = positional(args);

  switch (command) {
    case "keygen":
      keygen(version);
      return 0;
    case "sign": {
      const keyPath = option(args, "--key");
      if (!version || !keyPath) throw new Error("Usage: sign <version> --key <private.pem> [--repo owner/name]");
      const { files } = downloadChannelFiles(version, repo);
      signFiles(version, keyPath, files);
      for (const file of files) gh(["release", "upload", version, file, "--repo", repo, "--clobber"]);
      console.log(`\nUploaded ${files.length} signed update file(s) to release ${version}.`);
      return 0;
    }
    case "sign-files": {
      const keyPath = option(args, "--key");
      if (!version || !keyPath || rest.length === 0) {
        throw new Error("Usage: sign-files <version> --key <private.pem> <latest.yml>...");
      }
      signFiles(version, keyPath, rest);
      return 0;
    }
    case "verify": {
      if (!version) throw new Error("Usage: verify <version> [--repo owner/name]");
      const { files } = downloadChannelFiles(version, repo);
      if (verifyFiles(version, files)) return 0;
      console.error(
        `\nRelease ${version} is not signed. Sign it on the machine that holds the key:\n` +
          `  node .github/scripts/update-signing.mjs sign ${version} --key <update-signing-primary.pem>\n` +
          "then re-run this job."
      );
      return 1;
    }
    case "verify-files":
      if (!version || rest.length === 0) throw new Error("Usage: verify-files <version> <latest.yml>...");
      return verifyFiles(version, rest) ? 0 : 1;
    default:
      console.error("Commands: keygen <dir> | sign <version> --key <pem> | sign-files | verify <version> | verify-files");
      return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
