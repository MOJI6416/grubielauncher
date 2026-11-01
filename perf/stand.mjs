import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const local = process.env.LOCALAPPDATA || path.join(process.env.HOME || ".", ".local", "share");
export const seedRoot = process.env.PERF_SEED || path.join(local, "grubie-stand", "shots");
export const standRoot = path.join(local, "grubie-stand", "perf");
export const certDir = path.join(local, "grubie-stand", "perf-cert");

const cacheDirs = /[\\/](Cache|Code Cache|GPUCache|DawnGraphiteCache|DawnWebGPUCache|Crashpad|logs|blob_storage|Shared Dictionary)$/i;

function rewrite(dir, from, to) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) rewrite(full, from, to);
    else if (entry.name.endsWith(".json")) {
      const text = fs.readFileSync(full, "utf8");
      if (text.includes(from)) fs.writeFileSync(full, text.split(from).join(to));
    }
  }
}

export function ensureCert() {
  if (fs.existsSync(path.join(certDir, "cert.pem"))) return certDir;
  fs.mkdirSync(certDir, { recursive: true });
  const config = path.join(certDir, "req.cnf");
  fs.writeFileSync(
    config,
    [
      "[req]",
      "distinguished_name=dn",
      "x509_extensions=ext",
      "prompt=no",
      "[dn]",
      "CN=grubie-perf",
      "[ext]",
      "subjectAltName=DNS:*.grubielauncher.com,DNS:grubielauncher.com,DNS:localhost,IP:127.0.0.1",
    ].join("\n"),
  );
  execFileSync(
    "openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(certDir, "key.pem"), "-out", path.join(certDir, "cert.pem"), "-days", "365", "-config", config],
    { stdio: "ignore", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
  );
  return certDir;
}

function addHeavyInstance(data, { from = "Prominence II", name = "Mega Pack", count = 450 } = {}) {
  const versions = path.join(data, "minecraft", "versions");
  const source = path.join(versions, from);
  if (!fs.existsSync(source)) return;
  const target = path.join(versions, name);
  fs.cpSync(source, target, { recursive: true });
  const versionPath = path.join(target, "version.json");
  const version = JSON.parse(fs.readFileSync(versionPath, "utf8"));
  const base = version.loader.mods.filter((mod) => mod.projectType === "mod" && mod.version?.files?.length);
  const stub = fs.readdirSync(path.join(source, "mods")).find((file) => file.endsWith(".jar"));
  const stubBytes = fs.readFileSync(path.join(source, "mods", stub));
  fs.rmSync(path.join(target, "mods"), { recursive: true, force: true });
  fs.mkdirSync(path.join(target, "mods"));
  const mods = [];
  for (let index = 0; index < count; index++) {
    const original = base[index % base.length];
    const round = Math.floor(index / base.length);
    const suffix = round ? ` ${round + 1}` : "";
    const filename = round ? original.version.files[0].filename.replace(/\.jar$/, `-r${round}.jar`) : original.version.files[0].filename;
    mods.push({
      ...original,
      title: `${original.title}${suffix}`,
      id: round ? `${original.id}${round}` : original.id,
      version: { ...original.version, id: `${original.version.id}${round || ""}`, files: [{ ...original.version.files[0], filename }] },
    });
    fs.writeFileSync(path.join(target, "mods", filename), stubBytes);
  }
  version.name = name;
  version.loader.mods = [...mods, ...version.loader.mods.filter((mod) => mod.projectType !== "mod")];
  fs.writeFileSync(versionPath, JSON.stringify(version, null, 2));
}

export function prepareStand({ lang = "en" } = {}) {
  if (!fs.existsSync(path.join(seedRoot, "data", "settings.json"))) {
    throw new Error(`seed not found: ${seedRoot} (set PERF_SEED to a stand with data/ and userData/)`);
  }
  fs.rmSync(standRoot, { recursive: true, force: true });
  const userData = path.join(standRoot, "userData");
  const data = path.join(standRoot, "data");
  fs.cpSync(path.join(seedRoot, "data"), data, { recursive: true });
  fs.cpSync(path.join(seedRoot, "userData"), userData, { recursive: true, filter: (src) => !cacheDirs.test(src) });
  const fromData = path.join(seedRoot, "data");
  rewrite(data, JSON.stringify(fromData).slice(1, -1), JSON.stringify(data).slice(1, -1));
  rewrite(data, fromData.split(path.sep).join("/"), data.split(path.sep).join("/"));
  addHeavyInstance(data);
  fs.writeFileSync(path.join(userData, "data-location.json"), JSON.stringify({ root: data }));
  const settingsPath = path.join(data, "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  Object.assign(settings, { lang, sounds: false, seasonalDecor: false, closeToTray: false });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  fs.writeFileSync(
    path.join(data, "window-state.json"),
    JSON.stringify({ x: -3000, y: 100, width: 1280, height: 720, isMaximized: false }),
  );
  return { userData, data };
}
