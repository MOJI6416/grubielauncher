import fs from "fs-extra";
import path from "path";
import { ILocalAccount } from "@/types/Account";
import {
  IWorldAdvancementGroup,
  IWorldAdvancements,
  WorldAdvancementSource,
} from "@/types/World";
import { readEntryData, withArchive } from "./archiver";
import { getAccountUuids } from "./worlds";

const ENTRY = /^(?:data|assets)\/([a-z0-9_.-]+)\/advancements?\/(.+)\.json$/;
const GAME_VERSION_ID = /^[\w.+-]+$/;
const MAX_JSON_BYTES = 256 * 1024;

type Definitions = Map<string, boolean>;

interface Source {
  kind: WorldAdvancementSource;
  path: string;
}

export function advancementIdOf(entryName: string): string | null {
  const match = ENTRY.exec(entryName.split("\\").join("/"));
  if (!match || match[2].startsWith("recipes/")) return null;
  return `${match[1]}:${match[2]}`;
}

export function isShownAdvancement(text: string): boolean {
  try {
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.display === "object" &&
      parsed.display !== null
    );
  } catch {
    return false;
  }
}

async function readArchiveDefinitions(file: string): Promise<Definitions> {
  const definitions: Definitions = new Map();

  await withArchive(file, async (archive) => {
    for (const entry of archive.getEntries()) {
      if (entry.isDirectory || entry.size > MAX_JSON_BYTES) continue;
      const id = advancementIdOf(entry.entryName);
      if (!id) continue;
      const data = await readEntryData(entry).catch(() => null);
      if (data) definitions.set(id, isShownAdvancement(data.toString("utf8")));
    }
  });

  return definitions;
}

async function readFolderDefinitions(root: string): Promise<Definitions> {
  const definitions: Definitions = new Map();

  const visit = async (directory: string, relative: string[], depth: number) => {
    if (depth > 12) return;
    const entries = await fs
      .readdir(directory, { withFileTypes: true })
      .catch(() => [] as fs.Dirent[]);

    for (const entry of entries) {
      const next = [...relative, entry.name];
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(full, next, depth + 1);
        continue;
      }
      const id = advancementIdOf(next.join("/"));
      if (!id || !entry.isFile()) continue;
      const stats = await fs.stat(full).catch(() => null);
      if (!stats || stats.size > MAX_JSON_BYTES) continue;
      const text = await fs.readFile(full, "utf8").catch(() => null);
      if (text !== null) definitions.set(id, isShownAdvancement(text));
    }
  };

  for (const top of ["data", "assets"]) {
    await visit(path.join(root, top), [top], 0);
  }
  return definitions;
}

const definitionCache = new Map<
  string,
  { size: number; mtimeMs: number; definitions: Definitions }
>();
const DEFINITION_CACHE_LIMIT = 2048;

async function definitionsOf(file: string): Promise<Definitions> {
  const stats = await fs.stat(file).catch(() => null);
  if (!stats) return new Map();

  if (stats.isDirectory()) {
    return readFolderDefinitions(file).catch(() => new Map());
  }

  const cached = definitionCache.get(file);
  if (cached && cached.size === stats.size && cached.mtimeMs === stats.mtimeMs) {
    return cached.definitions;
  }

  const definitions = await readArchiveDefinitions(file).catch((error) => {
    console.warn("[advancements] cannot read", file, error);
    return new Map<string, boolean>();
  });

  if (definitionCache.size >= DEFINITION_CACHE_LIMIT) {
    const oldest = definitionCache.keys().next().value;
    if (oldest !== undefined) definitionCache.delete(oldest);
  }
  definitionCache.set(file, {
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    definitions,
  });
  return definitions;
}

async function listFiles(
  directory: string,
  accept: (name: string, isDirectory: boolean) => boolean,
): Promise<string[]> {
  const entries = await fs
    .readdir(directory, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  return entries
    .filter((entry) => accept(entry.name, entry.isDirectory()))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function collectSources(
  versionPath: string,
  worldPath: string,
  gameVersion: string | null,
  disabledDatapacks: string[],
): Promise<Source[]> {
  const sources: Source[] = [];

  if (gameVersion && GAME_VERSION_ID.test(gameVersion)) {
    sources.push({
      kind: "game",
      path: path.join(versionPath, `${gameVersion}.jar`),
    });
  }

  for (const file of await listFiles(
    path.join(versionPath, "mods"),
    (name, isDirectory) => !isDirectory && /\.jar$/i.test(name),
  )) {
    sources.push({ kind: "mod", path: file });
  }

  const disabled = new Set(
    disabledDatapacks
      .filter((entry) => entry.startsWith("file/"))
      .map((entry) => entry.slice("file/".length)),
  );
  for (const file of await listFiles(
    path.join(worldPath, "datapacks"),
    (name, isDirectory) =>
      !disabled.has(name) && (isDirectory || /\.zip$/i.test(name)),
  )) {
    sources.push({ kind: "datapack", path: file });
  }

  return sources;
}

export function parseAdvancementProgress(text: string): Set<string> {
  const done = new Set<string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return done;
  }
  if (typeof parsed !== "object" || parsed === null) return done;

  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (
      typeof value === "object" &&
      value !== null &&
      (value as { done?: unknown }).done === true
    ) {
      done.add(id);
    }
  }
  return done;
}

async function readProgress(
  worldPath: string,
  account: ILocalAccount,
): Promise<Set<string> | null> {
  let freshest: { path: string; mtimeMs: number } | null = null;

  for (const uuid of getAccountUuids(account)) {
    for (const candidate of [
      path.join(worldPath, "players", "advancements", `${uuid}.json`),
      path.join(worldPath, "advancements", `${uuid}.json`),
    ]) {
      const stats = await fs.stat(candidate).catch(() => null);
      if (!stats?.isFile()) continue;
      if (!freshest || stats.mtimeMs > freshest.mtimeMs) {
        freshest = { path: candidate, mtimeMs: stats.mtimeMs };
      }
    }
  }

  if (!freshest) return null;
  const text = await fs.readFile(freshest.path, "utf8").catch(() => null);
  return text === null ? null : parseAdvancementProgress(text);
}

export function summarizeAdvancements(
  layers: { kind: WorldAdvancementSource; file: string; definitions: Definitions }[],
  done: Set<string> | null,
): IWorldAdvancements | null {
  const shown = new Map<string, { kind: WorldAdvancementSource; file: string }>();

  for (const layer of layers) {
    for (const [id, isShown] of layer.definitions) {
      if (isShown) shown.set(id, { kind: layer.kind, file: layer.file });
      else shown.delete(id);
    }
  }

  if (shown.size === 0) return null;

  const groups = new Map<string, IWorldAdvancementGroup>();
  for (const [id, origin] of shown) {
    const namespace = id.slice(0, id.indexOf(":"));
    let group = groups.get(namespace);
    if (!group) {
      group = {
        namespace,
        source: origin.kind,
        file: origin.kind === "game" ? null : path.basename(origin.file),
        done: 0,
        total: 0,
      };
      groups.set(namespace, group);
    }
    group.total += 1;
    if (done?.has(id)) group.done += 1;
  }

  const list = [...groups.values()].sort(
    (left, right) =>
      Number(right.namespace === "minecraft") -
        Number(left.namespace === "minecraft") ||
      right.done - left.done ||
      right.total - left.total ||
      left.namespace.localeCompare(right.namespace),
  );

  return {
    done: list.reduce((sum, group) => sum + group.done, 0),
    total: list.reduce((sum, group) => sum + group.total, 0),
    groups: list,
    hasProgress: done !== null,
  };
}

export async function loadWorldAdvancements(
  versionPath: string,
  worldPath: string,
  account: ILocalAccount,
  gameVersion: string | null,
  disabledDatapacks: string[] = [],
): Promise<IWorldAdvancements | null> {
  const sources = await collectSources(
    path.resolve(versionPath),
    path.resolve(worldPath),
    gameVersion,
    disabledDatapacks,
  );

  const layers: {
    kind: WorldAdvancementSource;
    file: string;
    definitions: Definitions;
  }[] = [];
  for (const source of sources) {
    layers.push({
      kind: source.kind,
      file: source.path,
      definitions: await definitionsOf(source.path),
    });
  }

  return summarizeAdvancements(layers, await readProgress(worldPath, account));
}
