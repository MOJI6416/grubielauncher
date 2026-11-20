import fs from "fs-extra";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { PNG } from "pngjs";
import {
  LARGE_ARCHIVE_LIMITS,
  ZipArchive,
  openArchive,
  readEntryData,
} from "./archiver";
import { getLauncherPaths } from "./other";
import { compareGameVersions, findClientJars } from "./gameTextures";

const ASSET_ENTRY =
  /^assets\/([^/]+)\/(blockstates|models|items|textures|lang)\/[^]+\.(json|png|lang)$/i;
const CACHE_FOLDER = "block-assets";
const CACHE_VERSION = 1;
const STALE_MS = 60 * 24 * 60 * 60 * 1000;
const GAME_VERSION_ID = /^\d[\w.-]*$/;
const FLATTENED_VERSION = "1.13";

interface JarIndex {
  key: string;
  names: Set<string>;
  lower: Map<string, string>;
  namespaces: Set<string>;
}

const indexes = new Map<string, JarIndex>();
let swept = false;

function cacheRoot(): string {
  return path.join(getLauncherPaths().cache, CACHE_FOLDER);
}

function hash(value: string, length: number): string {
  return createHash("sha1").update(value).digest("hex").slice(0, length);
}

function comparablePath(target: string): string {
  const resolved = path.resolve(target);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export async function writeAtomically(target: string, data: Buffer) {
  await fs.ensureDir(path.dirname(target));
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, target);
  } catch (error) {
    await fs.remove(tmp).catch(() => undefined);
    throw error;
  }
}

async function sweepStale(root: string) {
  if (swept) return;
  swept = true;
  const folders = await fs.readdir(root).catch(() => [] as string[]);
  const now = Date.now();
  for (const folder of folders) {
    const stats = await fs
      .stat(path.join(root, folder, "index.json"))
      .catch(() => null);
    if (!stats || now - stats.mtimeMs > STALE_MS) {
      await fs.remove(path.join(root, folder)).catch(() => undefined);
    }
  }
}

function toIndex(key: string, names: string[]): JarIndex {
  const set = new Set(names);
  const lower = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const name of names) {
    lower.set(name.toLowerCase(), name);
    const match = ASSET_ENTRY.exec(name);
    if (match) namespaces.add(match[1]);
  }
  return { key, names: set, lower, namespaces };
}

export class JarAssets {
  private archive: ZipArchive | null;

  constructor(
    readonly jar: string,
    readonly index: JarIndex,
    readonly dir: string,
    archive: ZipArchive | null,
  ) {
    this.archive = archive;
  }

  get key(): string {
    return this.index.key;
  }

  has(name: string): boolean {
    return this.index.names.has(name);
  }

  find(name: string): string | null {
    if (this.index.names.has(name)) return name;
    return this.index.lower.get(name.toLowerCase()) ?? null;
  }

  async read(name: string): Promise<Buffer | null> {
    const entryName = this.find(name);
    if (!entryName) return null;
    const file = path.join(this.dir, "files", ...entryName.split("/"));
    const cached = await fs.readFile(file).catch(() => null);
    if (cached) return cached;

    try {
      this.archive ??= await openArchive(this.jar, LARGE_ARCHIVE_LIMITS);
      const entry = this.archive.getEntry(entryName);
      if (!entry) return null;
      const data = await readEntryData(entry);
      await writeAtomically(file, data).catch(() => undefined);
      return data;
    } catch {
      return null;
    }
  }

  close() {
    this.archive?.close();
    this.archive = null;
  }
}

export async function openJarAssets(jar: string): Promise<JarAssets | null> {
  const stats = await fs.stat(jar).catch(() => null);
  if (!stats?.isFile()) return null;

  const root = cacheRoot();
  void sweepStale(root);
  const pathKey = hash(comparablePath(jar), 12);
  const key = `${pathKey}-${hash(`${stats.size}:${Math.round(stats.mtimeMs)}:${CACHE_VERSION}`, 8)}`;
  const dir = path.join(root, key);
  const indexFile = path.join(dir, "index.json");

  const known = indexes.get(comparablePath(jar));
  if (known?.key === key) return new JarAssets(jar, known, dir, null);

  const stored = await fs.readJson(indexFile).catch(() => null);
  if (Array.isArray(stored)) {
    const index = toIndex(key, stored.filter((name) => typeof name === "string"));
    indexes.set(comparablePath(jar), index);
    const now = new Date();
    await fs.utimes(indexFile, now, now).catch(() => undefined);
    return new JarAssets(jar, index, dir, null);
  }

  let archive: ZipArchive;
  try {
    archive = await openArchive(jar, LARGE_ARCHIVE_LIMITS);
  } catch {
    return null;
  }
  const names = archive
    .getEntries()
    .filter((entry) => !entry.isDirectory && ASSET_ENTRY.test(entry.entryName))
    .map((entry) => entry.entryName);

  const siblings = await fs.readdir(root).catch(() => [] as string[]);
  for (const folder of siblings) {
    if (folder.startsWith(`${pathKey}-`) && folder !== key) {
      await fs.remove(path.join(root, folder)).catch(() => undefined);
    }
  }
  await writeAtomically(indexFile, Buffer.from(JSON.stringify(names))).catch(
    () => undefined,
  );

  const index = toIndex(key, names);
  indexes.set(comparablePath(jar), index);
  return new JarAssets(jar, index, dir, archive);
}

export function parseLenientJson(data: Buffer | string): unknown {
  const text = (typeof data === "string" ? data : data.toString("utf8")).replace(
    /^\uFEFF/,
    "",
  );
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(
        text
          .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[^]*?\*\//g, (_, quoted) =>
            quoted ?? "",
          )
          .replace(/,(\s*[}\]])/g, "$1"),
      );
    } catch {
      return null;
    }
  }
}

export interface GameSource {
  id: string;
  jar: string;
  manifest: string;
}

async function instanceGame(versionPath: string): Promise<GameSource | null> {
  const conf = (await fs
    .readJson(path.join(versionPath, "version.json"))
    .catch(() => null)) as { version?: { id?: unknown } } | null;
  const id = conf?.version?.id;
  if (typeof id !== "string" || !GAME_VERSION_ID.test(id)) return null;
  const jar = path.join(versionPath, `${id}.jar`);
  if (!(await fs.pathExists(jar))) return null;
  return { id, jar, manifest: path.join(versionPath, `${id}.json`) };
}

function isFlattened(id: string): boolean {
  return compareGameVersions(id, FLATTENED_VERSION) >= 0;
}

export interface AssetSession {
  game: JarAssets[];
  gameSource: "instance" | "other" | "none";
  assetIndex: string | null;
  jarsFor(namespace: string): Promise<JarAssets[]>;
  close(): void;
}

async function assetIndexPath(manifest: string): Promise<string | null> {
  const json = (await fs.readJson(manifest).catch(() => null)) as {
    assetIndex?: { id?: unknown };
  } | null;
  const id = json?.assetIndex?.id;
  if (typeof id !== "string" || !/^[\w.-]+$/.test(id)) return null;
  return path.join(getLauncherPaths().minecraft, "assets", "indexes", `${id}.json`);
}

export async function openAssetSession(versionPath: string): Promise<AssetSession> {
  const own = await instanceGame(versionPath);
  let modern: GameSource | null = own && isFlattened(own.id) ? own : null;
  let gameSource: AssetSession["gameSource"] = modern ? "instance" : "none";

  if (!modern) {
    const versionsDir = path.join(getLauncherPaths().minecraft, "versions");
    for (const client of await findClientJars(versionsDir)) {
      if (!isFlattened(client.id)) continue;
      modern = {
        id: client.id,
        jar: client.jar,
        manifest: path.join(path.dirname(client.jar), `${client.id}.json`),
      };
      gameSource = "other";
      break;
    }
  }

  const game: JarAssets[] = [];
  for (const source of [modern, own && own !== modern ? own : null]) {
    if (!source) continue;
    const assets = await openJarAssets(source.jar);
    if (assets) game.push(assets);
  }
  if (!game.length) gameSource = "none";

  const opened: JarAssets[] = [...game];
  let mods: Promise<JarAssets[]> | null = null;
  const loadMods = async () => {
    const folder = path.join(versionPath, "mods");
    const files = await fs.readdir(folder).catch(() => [] as string[]);
    const list: JarAssets[] = [];
    for (const file of files.sort()) {
      if (!/\.jar$/i.test(file)) continue;
      const assets = await openJarAssets(path.join(folder, file));
      if (!assets) continue;
      opened.push(assets);
      list.push(assets);
    }
    return list;
  };

  return {
    game,
    gameSource,
    assetIndex: modern ? await assetIndexPath(modern.manifest) : null,
    async jarsFor(namespace) {
      if (namespace === "minecraft") return game;
      mods ??= loadMods();
      const all = await mods;
      return [
        ...all.filter((jar) => jar.index.namespaces.has(namespace)),
        ...game.filter((jar) => jar.index.namespaces.has(namespace)),
      ];
    },
    close() {
      for (const jar of opened) jar.close();
    },
  };
}

export async function withAssetSession<T>(
  versionPath: string,
  use: (session: AssetSession) => Promise<T>,
): Promise<T> {
  const session = await openAssetSession(versionPath);
  try {
    return await use(session);
  } finally {
    session.close();
  }
}

export interface DecodedImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export function decodePng(data: Buffer): DecodedImage | null {
  try {
    const png = PNG.sync.read(data);
    return {
      width: png.width,
      height: png.height,
      pixels: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
    };
  } catch {
    return null;
  }
}

export function encodeRgbaPng(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Buffer {
  const png = new PNG({ width, height });
  png.data = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  return PNG.sync.write(png);
}
