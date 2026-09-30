import fs from "fs-extra";
import path from "path";
import Zip from "adm-zip";
import toml from "toml";
import pLimit from "p-limit";
import type {
  LocalModDependencies,
  LocalModDependencyIndex,
} from "@/types/ModManager";
import { openArchive, readEntryData } from "./archiver";

const cache = new Map<string, LocalModDependencies>();
const MAX_DESCRIPTOR_BYTES = 1024 * 1024;
const MAX_NESTED_BYTES = 32 * 1024 * 1024;

function ids(values: unknown[]): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && /^[a-z0-9_.-]{1,256}$/i.test(value),
      ),
    ),
  ];
}

export function fabricDependencies(data: any): LocalModDependencies {
  return {
    provides: ids([
      data?.id,
      ...(Array.isArray(data?.provides) ? data.provides : []),
    ]),
    requires: ids(Object.keys(data?.depends ?? {})),
  };
}

export function quiltDependencies(data: any): LocalModDependencies {
  const loader = data?.quilt_loader;
  return {
    provides: ids([
      loader?.id,
      ...(loader?.provides ?? []).map((item: any) =>
        typeof item === "string" ? item : item?.id,
      ),
    ]),
    // Arrays express alternatives, so they cannot imply one required installed mod.
    requires: ids(
      (loader?.depends ?? [])
        .filter(
          (item: any) =>
            !Array.isArray(item) && !item?.optional && !item?.unless,
        )
        .map((item: any) => (typeof item === "string" ? item : item?.id)),
    ),
  };
}

export function forgeDependencies(data: any): LocalModDependencies {
  const provides = ids((data?.mods ?? []).map((mod: any) => mod?.modId));
  return {
    provides,
    requires: ids(
      provides.flatMap((id) =>
        (data?.dependencies?.[id] ?? [])
          .filter(
            (dep: any) =>
              dep?.type === "required" ||
              (dep?.type === undefined && dep?.mandatory === true),
          )
          .map((dep: any) => dep?.modId),
      ),
    ),
  };
}

async function readDescriptors(
  archive: Zip,
  depth = 0,
  budget = { remaining: MAX_NESTED_BYTES },
): Promise<LocalModDependencies> {
  const provides = new Set<string>();
  const requires = new Set<string>();
  const nested = new Set<string>();
  for (const name of [
    "fabric.mod.json",
    "quilt.mod.json",
    "META-INF/neoforge.mods.toml",
    "META-INF/mods.toml",
  ]) {
    const entry = archive.getEntry(name);
    if (!entry || entry.header.size > MAX_DESCRIPTOR_BYTES) continue;
    try {
      const content = (await readEntryData(entry)).toString("utf-8");
      const data = name.endsWith(".toml")
        ? toml.parse(content)
        : JSON.parse(content);
      const info =
        name === "fabric.mod.json"
          ? fabricDependencies(data)
          : name === "quilt.mod.json"
            ? quiltDependencies(data)
            : forgeDependencies(data);
      info.provides.forEach((id) => provides.add(id));
      info.requires.forEach((id) => requires.add(id));
      for (const jar of data?.jars ?? data?.quilt_loader?.jars ?? []) {
        const filename = typeof jar === "string" ? jar : jar?.file;
        if (typeof filename === "string") nested.add(filename);
      }
    } catch {
      // A malformed descriptor must not prevent other installed mods being read.
    }
  }
  const jarJar = archive.getEntry("META-INF/jarjar/metadata.json");
  if (jarJar && jarJar.header.size <= MAX_DESCRIPTOR_BYTES) {
    try {
      const data = JSON.parse((await readEntryData(jarJar)).toString("utf-8"));
      for (const jar of data?.jars ?? [])
        if (typeof jar?.path === "string") nested.add(jar.path);
    } catch {}
  }
  if (depth < 2)
    for (const name of nested) {
      const entry = archive.getEntry(name);
      if (!entry || entry.header.size > budget.remaining) continue;
      budget.remaining -= entry.header.size;
      try {
        const info = await readDescriptors(
          new Zip(await readEntryData(entry)),
          depth + 1,
          budget,
        );
        info.provides.forEach((id) => provides.add(id));
        info.requires.forEach((id) => requires.add(id));
      } catch {}
    }
  return {
    provides: [...provides],
    requires: [...requires].filter((id) => !provides.has(id)),
  };
}

export async function readLocalModDependencies(
  modPath: string,
): Promise<LocalModDependencies> {
  const stats = await fs.stat(modPath);
  const key = `${path.resolve(modPath)}|${stats.size}|${stats.mtimeMs}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const info = await readDescriptors(await openArchive(modPath));
  if (cache.size >= 1024) cache.delete(cache.keys().next().value!);
  cache.set(key, info);
  return info;
}

export async function scanLocalModDependencies(
  versionPath: string,
): Promise<LocalModDependencyIndex> {
  const folder = path.join(versionPath, "mods");
  const entries = await fs
    .readdir(folder, { withFileTypes: true })
    .catch(() => []);
  const limit = pLimit(4);
  const result: LocalModDependencyIndex = {};
  await Promise.all(
    entries
      .filter(
        (entry) => entry.isFile() && /\.jar(\.disabled)?$/i.test(entry.name),
      )
      .map((entry) =>
        limit(async () => {
          const info = await readLocalModDependencies(
            path.join(folder, entry.name),
          ).catch(() => null);
          if (info)
            result[entry.name.replace(/\.disabled$/i, "").toLowerCase()] = info;
        }),
      ),
  );
  return result;
}
