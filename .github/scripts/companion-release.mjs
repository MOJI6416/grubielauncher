import { createHash, sign, verify } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertKnownKey, loadPublicKeys, readPrivateKey } from "./update-signing.mjs";

export const MOD_REPO = "MOJI6416/grubie-companion";
export const CDN_HOST = "cdn.grubielauncher.com";
export const MANIFEST_URL = `https://${CDN_HOST}/companion/manifest.json`;
export const FORMAT = 1;

const API_URL = (process.env.GRUBIE_API_URL || "https://api.grubielauncher.com").replace(/\/+$/, "");
const DEFAULT_DIR = path.join(os.tmpdir(), "grubie-companion-release");
const CONTEXT = "grubie-companion-manifest\n";
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const JAR_NAME = /^grubie-companion-[0-9A-Za-z._+-]+\.jar$/;
const MINECRAFT_ID = /^\d[0-9A-Za-z._-]*$/;
const LOADER = /^[a-z][a-z0-9-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");

export function manifestMessage(signed) {
  return Buffer.from(`${CONTEXT}${signed}`, "utf8");
}

function preRelease(text) {
  return text ? text.split(".") : [];
}

export function compareVersions(left, right) {
  const a = VERSION.exec(left);
  const b = VERSION.exec(right);
  if (!a || !b) throw new Error(`Не semver: ${!a ? left : right}`);
  for (let index = 1; index <= 3; index += 1) {
    const order = Number(a[index]) - Number(b[index]);
    if (order !== 0) return Math.sign(order);
  }
  const pa = preRelease(a[4]);
  const pb = preRelease(b[4]);
  if (pa.length === 0 || pb.length === 0) return Math.sign(pb.length - pa.length);
  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    if (pa[index] === undefined) return -1;
    if (pb[index] === undefined) return 1;
    const na = /^\d+$/.test(pa[index]);
    const nb = /^\d+$/.test(pb[index]);
    if (na && nb && Number(pa[index]) !== Number(pb[index])) return Math.sign(Number(pa[index]) - Number(pb[index]));
    if (na !== nb) return na ? -1 : 1;
    if (pa[index] !== pb[index]) return pa[index] < pb[index] ? -1 : 1;
  }
  return 0;
}

export function assertModVersion(version) {
  if (typeof version !== "string" || !VERSION.test(version)) {
    throw new Error(`Версия мода ${JSON.stringify(version)} не похожа на semver (например, 2.0.0)`);
  }
  return version;
}

export function jarKey(version, file) {
  return `companion/${version}/${file}`;
}

export function jarUrl(version, file) {
  return `https://${CDN_HOST}/companion/${version}/${encodeURIComponent(file)}`;
}

export function releaseAssetUrl(version, file) {
  return `https://github.com/${MOD_REPO}/releases/download/v${encodeURIComponent(version)}/${encodeURIComponent(file)}`;
}

function jarProblems(version, jar) {
  if (!isRecord(jar)) return ["не объект"];
  const problems = [];
  if (typeof jar.file !== "string" || !JAR_NAME.test(jar.file)) problems.push(`имя файла ${JSON.stringify(jar.file)} не разрешено`);
  if (typeof jar.sha256 !== "string" || !SHA256.test(jar.sha256)) problems.push("sha256 — не 64 строчные hex-цифры");
  if (!Number.isSafeInteger(jar.size) || jar.size < 1) problems.push("size — не положительное целое");
  let url = null;
  try {
    url = new URL(jar.url);
  } catch {}
  if (!url || url.protocol !== "https:" || url.host !== CDN_HOST || url.username || url.password) {
    problems.push(`url ${JSON.stringify(jar.url)} — не https на ${CDN_HOST}`);
  } else if (typeof jar.file === "string" && decodeURIComponent(url.pathname) !== `/${jarKey(version, jar.file)}`) {
    problems.push(`url должен вести на /${jarKey(version, jar.file)}`);
  }
  return problems;
}

export function validateManifest(manifest) {
  if (!isRecord(manifest)) return ["манифест — не объект"];
  const problems = [];
  if (manifest.format !== FORMAT) problems.push(`format ${JSON.stringify(manifest.format)} вместо ${FORMAT}`);
  if (!Number.isSafeInteger(manifest.sequence) || manifest.sequence < 0) problems.push("sequence — не неотрицательное целое");
  if (typeof manifest.published !== "string") problems.push("published — не строка");
  if (!isRecord(manifest.mods)) return [...problems, "mods — не объект"];
  for (const [version, release] of Object.entries(manifest.mods)) {
    if (!VERSION.test(version)) {
      problems.push(`${version}: не semver`);
      continue;
    }
    if (!isRecord(release) || !isRecord(release.minecraft)) {
      problems.push(`${version}: нет таблицы minecraft`);
      continue;
    }
    if (!Number.isSafeInteger(release.protocol) || release.protocol < 1) problems.push(`${version}: protocol — не положительное целое`);
    for (const [minecraft, loaders] of Object.entries(release.minecraft)) {
      if (!isRecord(loaders)) {
        problems.push(`${version} ${minecraft}: не таблица загрузчиков`);
        continue;
      }
      for (const [loader, jar] of Object.entries(loaders)) {
        for (const problem of jarProblems(version, jar)) problems.push(`${version} ${loader} ${minecraft}: ${problem}`);
      }
    }
  }
  return problems;
}

export function validateTargets(targets, version) {
  const problems = [];
  if (!isRecord(targets)) return ["targets.json — не объект"];
  if (targets.mod !== version) problems.push(`targets.json для ${JSON.stringify(targets.mod)}, а не для ${version}`);
  if (!VERSION.test(version)) problems.push(`${version} — не semver`);
  if (!Number.isSafeInteger(targets.protocol) || targets.protocol < 1) problems.push("protocol — не положительное целое");
  if (!Array.isArray(targets.files) || targets.files.length === 0) return [...problems, "files пуст"];
  const seen = new Set();
  for (const entry of targets.files) {
    const name = JSON.stringify(entry?.file);
    if (!isRecord(entry) || typeof entry.file !== "string" || !JAR_NAME.test(entry.file)) problems.push(`имя файла ${name} не разрешено`);
    else if (seen.has(`${entry.file}|${entry.loader}`)) problems.push(`${entry.file} указан дважды для ${entry.loader}`);
    else seen.add(`${entry.file}|${entry.loader}`);
    if (typeof entry?.loader !== "string" || !LOADER.test(entry.loader)) problems.push(`${name}: загрузчик ${JSON.stringify(entry?.loader)} не разрешён`);
    if (!Array.isArray(entry?.minecraft) || entry.minecraft.length === 0 || !entry.minecraft.every((id) => typeof id === "string" && MINECRAFT_ID.test(id))) {
      problems.push(`${name}: minecraft должен быть непустым списком версий`);
    }
  }
  return problems;
}

function releaseRows(release) {
  const rows = [];
  for (const [minecraft, loaders] of Object.entries(release.minecraft)) {
    for (const [loader, jar] of Object.entries(loaders)) {
      rows.push(`${minecraft}|${loader}|${jar.file}|${jar.url}|${jar.sha256}|${jar.size}`);
    }
  }
  return `${release.protocol}\n${rows.sort().join("\n")}`;
}

export function buildManifest({ targets, jars, previous = null, keep = 3, now = new Date() }) {
  const version = targets.mod;
  const minecraft = Object.create(null);
  for (const entry of targets.files) {
    const built = jars.get(entry.file);
    if (!built) throw new Error(`${entry.file} не посчитан`);
    for (const id of entry.minecraft) {
      minecraft[id] ??= Object.create(null);
      if (minecraft[id][entry.loader]) throw new Error(`Два файла для ${entry.loader} ${id}`);
      minecraft[id][entry.loader] = { file: entry.file, url: jarUrl(version, entry.file), sha256: built.sha256, size: built.size };
    }
  }
  const release = { protocol: targets.protocol, minecraft };

  const mods = Object.create(null);
  for (const [known, entry] of Object.entries(previous?.mods ?? {})) mods[known] = entry;
  if (mods[version] && releaseRows(mods[version]) !== releaseRows(release)) {
    throw new Error(`${version} уже опубликована с другими файлами. Jar на CDN не меняются: выпустите новую версию мода.`);
  }
  mods[version] = release;

  const kept = Object.keys(mods).sort((a, b) => compareVersions(b, a)).slice(0, keep);
  if (!kept.includes(version)) {
    throw new Error(`${version} старше ${keep} новейших опубликованных версий; чтобы выпустить её, увеличьте --keep`);
  }

  return {
    format: FORMAT,
    sequence: (previous?.sequence ?? 0) + 1,
    published: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    mods: Object.fromEntries(kept.map((known) => [known, mods[known]]))
  };
}

export function signManifest(manifest, privateKey, keyId) {
  const signed = JSON.stringify(manifest);
  return { keyId, signature: sign(null, manifestMessage(signed), privateKey).toString("base64"), signed };
}

export function verifyEnvelope(envelope, keys) {
  if (!isRecord(envelope) || typeof envelope.signature !== "string" || typeof envelope.signed !== "string") {
    return { ok: false, problems: ["это не конверт с signature и signed"] };
  }
  const signature = Buffer.from(envelope.signature, "base64");
  const message = manifestMessage(envelope.signed);
  const signer = signature.length === 64 ? keys.find(({ key }) => verify(null, message, key, signature)) : undefined;
  if (!signer) return { ok: false, problems: ["подпись не подходит ни к одному ключу лаунчера"] };
  let manifest;
  try {
    manifest = JSON.parse(envelope.signed);
  } catch {
    return { ok: false, keyId: signer.id, problems: ["подписанный текст — не JSON"] };
  }
  const problems = validateManifest(manifest);
  return { ok: problems.length === 0, keyId: signer.id, manifest, problems };
}

export function uniqueJars(manifest) {
  const jars = new Map();
  for (const [version, release] of Object.entries(manifest.mods)) {
    for (const loaders of Object.values(release.minecraft)) {
      for (const jar of Object.values(loaders)) jars.set(jarKey(version, jar.file), { ...jar, version, key: jarKey(version, jar.file) });
    }
  }
  return [...jars.values()];
}

export function describe(manifest) {
  const lines = [`sequence ${manifest.sequence}, опубликован ${manifest.published}`];
  for (const [version, release] of Object.entries(manifest.mods).sort(([a], [b]) => compareVersions(b, a))) {
    const targets = [];
    for (const [minecraft, loaders] of Object.entries(release.minecraft)) {
      for (const loader of Object.keys(loaders)) targets.push(`${loader} ${minecraft}`);
    }
    lines.push(`  ${version} (protocol ${release.protocol}): ${targets.sort().join(", ")}`);
  }
  return lines.join("\n");
}

function verifiedOrThrow(envelope, keys, label) {
  const result = verifyEnvelope(envelope, keys);
  if (!result.ok) throw new Error(`${label} не проходит проверку:\n  ${result.problems.join("\n  ")}`);
  return result;
}

async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function readSource(source) {
  if (!/^https?:\/\//i.test(source)) return fs.readFileSync(source);
  return fetchBytes(source);
}

async function readEnvelope(source) {
  const bytes = await readSource(source);
  return bytes === null ? null : JSON.parse(bytes.toString("utf8"));
}

function freshManifestUrl() {
  return `${MANIFEST_URL}?fresh=${Date.now()}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function releasePaths(dir) {
  return {
    unsigned: path.join(dir, "manifest.unsigned.json"),
    envelope: path.join(dir, "manifest.json"),
    version: (version) => path.join(dir, version)
  };
}

async function download(version, dir) {
  assertModVersion(version);
  const target = releasePaths(dir).version(version);
  const targetsBytes = await fetchBytes(releaseAssetUrl(version, "targets.json"));
  if (targetsBytes === null) {
    throw new Error(`В релизе v${version} репозитория ${MOD_REPO} нет targets.json: релиз мода ещё не опубликован или версия другая`);
  }
  const targets = JSON.parse(targetsBytes.toString("utf8"));
  const problems = validateTargets(targets, version);
  if (problems.length > 0) throw new Error(`targets.json:\n  ${problems.join("\n  ")}`);

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "targets.json"), targetsBytes);
  const files = [...new Set(targets.files.map((entry) => entry.file))];
  for (const file of files) {
    const bytes = await fetchBytes(releaseAssetUrl(version, file));
    if (bytes === null) throw new Error(`В релизе v${version} нет ${file}`);
    if (bytes.length === 0) throw new Error(`${file} пустой`);
    fs.writeFileSync(path.join(target, file), bytes);
  }
  console.log(`Скачано из релиза v${version}: targets.json и ${files.length} jar`);
}

async function prepare(version, dir, previousSource, keep) {
  assertModVersion(version);
  if (!Number.isSafeInteger(keep) || keep < 1) throw new Error("--keep должен быть положительным целым");
  const paths = releasePaths(dir);
  const targets = readJson(path.join(paths.version(version), "targets.json"));
  const problems = validateTargets(targets, version);
  if (problems.length > 0) throw new Error(`targets.json:\n  ${problems.join("\n  ")}`);

  const jars = new Map();
  for (const entry of targets.files) {
    const bytes = fs.readFileSync(path.join(paths.version(version), entry.file));
    if (bytes.length === 0) throw new Error(`${entry.file} пустой`);
    jars.set(entry.file, { sha256: sha256Hex(bytes), size: bytes.length });
  }

  let previous = null;
  if (previousSource !== "none") {
    const source = previousSource ?? freshManifestUrl();
    const envelope = await readEnvelope(source);
    if (envelope === null) {
      throw new Error(`Манифеста нет: ${source}. Самый первый выпуск запускается с first_release (--previous none).`);
    }
    previous = verifiedOrThrow(envelope, loadPublicKeys(), `Предыдущий манифест (${source})`).manifest;
  }

  const manifest = buildManifest({ targets, jars, previous, keep });
  const after = validateManifest(manifest);
  if (after.length > 0) throw new Error(`Новый манифест неверен:\n  ${after.join("\n  ")}`);
  writeJson(paths.unsigned, manifest);
  console.log(`Манифест подготовлен:\n${describe(manifest)}`);
}

function signCommand(dir, keyPath) {
  if (!keyPath) throw new Error("Использование: sign --key <private.pem> [--dir <папка>]");
  const paths = releasePaths(dir);
  const keys = loadPublicKeys();
  const privateKey = readPrivateKey(keyPath);
  const keyId = assertKnownKey(privateKey);
  const manifest = readJson(paths.unsigned);
  const problems = validateManifest(manifest);
  if (problems.length > 0) throw new Error(`${path.basename(paths.unsigned)}:\n  ${problems.join("\n  ")}`);

  const envelope = signManifest(manifest, privateKey, keyId);
  const result = verifiedOrThrow(envelope, keys, "Подписанный манифест");
  writeJson(paths.envelope, envelope);
  console.log(`Манифест подписан ключом ${result.keyId}, sequence ${result.manifest.sequence}`);
}

async function publishCommand(dir) {
  const token = (process.env.RELEASE_AGENT_TOKEN || "").trim();
  if (!token) throw new Error("Нет секрета RELEASE_AGENT_TOKEN");
  const envelope = readJson(releasePaths(dir).envelope);
  const { manifest } = verifiedOrThrow(envelope, loadPublicKeys(), "Подписанный манифест");

  const url = `${API_URL}/agent/companion-releases`;
  const body = JSON.stringify({ keyId: envelope.keyId, signature: envelope.signature, signed: envelope.signed });
  let lastError = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-release-token": token },
        body,
        signal: AbortSignal.timeout(110_000)
      });
      const text = await response.text();
      if (response.ok) {
        const result = JSON.parse(text);
        if (result.unchanged) {
          console.log(`api: манифест sequence ${manifest.sequence} уже опубликован`);
        } else {
          console.log(`api: опубликован манифест sequence ${result.sequence}, загружено jar: ${result.stored.length}`);
          for (const key of result.stored) console.log(`  ${key}`);
        }
        return;
      }
      lastError = `${response.status} ${text}`;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error.message;
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
  }
  throw new Error(`api: ${lastError}`);
}

async function verifyCommand(dir, checkJars, expectOwn) {
  const keys = loadPublicKeys();
  const source = freshManifestUrl();
  const envelope = await readEnvelope(source);
  if (envelope === null) throw new Error(`На CDN нет манифеста: ${MANIFEST_URL}`);
  const result = verifiedOrThrow(envelope, keys, MANIFEST_URL);
  console.log(`${MANIFEST_URL}: подписан ключом ${result.keyId}\n${describe(result.manifest)}`);

  if (expectOwn) {
    const own = readJson(releasePaths(dir).envelope);
    if (own.signed !== envelope.signed) {
      throw new Error(`На CDN не тот манифест, что отправлен: sequence ${result.manifest.sequence} вместо ${JSON.parse(own.signed).sequence}`);
    }
  }
  if (!checkJars) return true;

  let ok = true;
  for (const jar of uniqueJars(result.manifest)) {
    let problem = null;
    try {
      const bytes = await fetchBytes(jar.url);
      problem = bytes === null ? "нет файла" : sha256Hex(bytes) !== jar.sha256 ? "sha256 не совпал" : bytes.length !== jar.size ? "размер не совпал" : null;
    } catch (error) {
      problem = error.message;
    }
    if (problem) ok = false;
    console[problem ? "error" : "log"](`${problem ? "FAIL" : "ok  "} ${jar.key}${problem ? `: ${problem}` : ""}`);
  }
  return ok;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const FLAGS = new Set(["--jars", "--own"]);

function positional(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (FLAGS.has(args[index])) continue;
    if (args[index].startsWith("--")) {
      index += 1;
      continue;
    }
    values.push(args[index]);
  }
  return values;
}

async function main(argv) {
  const [command, ...args] = argv;
  const [first] = positional(args);
  const dir = path.resolve(option(args, "--dir") || DEFAULT_DIR);
  switch (command) {
    case "download":
      await download(first, dir);
      return 0;
    case "prepare":
      await prepare(first, dir, option(args, "--previous"), Number(option(args, "--keep") ?? 3));
      return 0;
    case "sign":
      signCommand(dir, option(args, "--key"));
      return 0;
    case "publish":
      await publishCommand(dir);
      return 0;
    case "verify":
      return (await verifyCommand(dir, args.includes("--jars"), args.includes("--own"))) ? 0 : 1;
    default:
      console.error(
        "Команды (у всех есть --dir <папка>):\n" +
          "  download <версия мода>\n" +
          "  prepare <версия мода> [--previous <файл-или-url>|none] [--keep 3]\n" +
          "  sign --key <private.pem>\n" +
          "  publish\n" +
          "  verify [--own] [--jars]"
      );
      return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  );
}
