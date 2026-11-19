import {
  ProjectType,
  Provider,
  type IVersion,
} from "@/types/ModManager";
import type { IModpack as CurseForgeModpack } from "@/types/CurseForge";
import type {
  ModpackContents,
  ModpackContentsEntry,
} from "@/types/ModpackContents";
import { CurseForge } from "../services/CurseForge";
import { ModManager } from "../services/ModManager";
import {
  buildForgeCdnUrls,
  classIdToProjectType,
  folderToProjectType,
} from "./modManager";
import { resolveDownloadCandidates } from "./mirrors";
import {
  getDownloadSource,
  getMojangReachable,
  isMirrorDisabled,
} from "./mirrorState";
import {
  httpRangeReaders,
  RangeUnsupportedError,
  readRemoteZipEntry,
  readRemoteZipIndex,
  type RemoteZipEntry,
} from "./remoteZip";

const CACHE_LIMIT = 40;
const OVERRIDE_ROOTS = ["overrides/", "client-overrides/"];
const cache = new Map<string, Promise<ModpackContents>>();

function remember(key: string, value: Promise<ModpackContents>) {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function overrideContentEntries(
  entries: Pick<RemoteZipEntry, "name">[],
): ModpackContentsEntry[] {
  const result: ModpackContentsEntry[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const name = entry.name.replace(/\\/g, "/");
    const root = OVERRIDE_ROOTS.find((prefix) => name.startsWith(prefix));
    if (!root || name.endsWith("/")) continue;

    const relative = name.slice(root.length);
    const parts = relative.split("/");
    if (parts.length !== 2) continue;

    const projectType = folderToProjectType(parts[0]);
    const fileName = parts[1];
    if (!projectType || !fileName || seen.has(relative)) continue;
    if (projectType === ProjectType.MOD && !/\.jar(\.disabled)?$/i.test(fileName)) continue;
    seen.add(relative);

    result.push({
      key: `${Provider.LOCAL}:${relative}`,
      title: fileName,
      iconUrl: null,
      provider: Provider.LOCAL,
      projectType,
    });
  }

  return result;
}

export function curseForgeEntries(
  manifest: Pick<CurseForgeModpack, "files">,
  mods: { id: number; name: string; classId?: number | null; logo?: { url?: string } | null }[],
): ModpackContentsEntry[] {
  const byId = new Map(mods.map((mod) => [mod.id, mod]));
  const result: ModpackContentsEntry[] = [];
  const seen = new Set<number>();

  for (const file of manifest.files ?? []) {
    if (seen.has(file.projectID)) continue;
    seen.add(file.projectID);

    const mod = byId.get(file.projectID);
    result.push({
      key: `${Provider.CURSEFORGE}:${file.projectID}`,
      title: mod?.name || `#${file.projectID}`,
      iconUrl: mod?.logo?.url || null,
      provider: Provider.CURSEFORGE,
      projectType: classIdToProjectType(mod?.classId) ?? ProjectType.MOD,
      ...(file.required === false ? { optional: true } : {}),
    });
  }

  return result;
}

function curseForgeArchiveUrls(version: IVersion): string[] {
  const file = version.files[0];
  if (!file) return [];

  const fileId = Number(version.id);
  const direct = file.url && !file.url.startsWith("blocked::") ? [file.url] : [];
  const candidates = [...direct, ...buildForgeCdnUrls(fileId, file.filename)].flatMap(
    (url) =>
      resolveDownloadCandidates(
        url,
        getDownloadSource(),
        getMojangReachable(),
        isMirrorDisabled(),
      ),
  );

  return [...new Set(candidates)];
}

async function readCurseForgeArchive(
  urls: string[],
): Promise<{ manifest: CurseForgeModpack; entries: RemoteZipEntry[] }> {
  let lastError: unknown = new Error("NO_ARCHIVE_URL");

  for (const url of urls) {
    try {
      const readers = httpRangeReaders(url);
      const entries = await readRemoteZipIndex(readers);
      const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
      if (!manifestEntry) throw new Error("NO_MANIFEST");

      const data = await readRemoteZipEntry(readers.readRange, manifestEntry);
      const manifest = JSON.parse(data.toString("utf8")) as CurseForgeModpack;
      if (!Array.isArray(manifest.files)) throw new Error("BAD_MANIFEST");

      return { manifest, entries };
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message === "NO_MANIFEST") throw error;
      if (error instanceof RangeUnsupportedError) continue;
    }
  }

  throw lastError;
}

async function loadCurseForgeContents(version: IVersion): Promise<ModpackContents> {
  const { manifest, entries } = await readCurseForgeArchive(
    curseForgeArchiveUrls(version),
  );
  const ids = [...new Set(manifest.files.map((file) => file.projectID))];
  const mods = ids.length > 0 ? ((await CurseForge.getMods(ids)) ?? []) : [];

  return {
    items: [...curseForgeEntries(manifest, mods), ...overrideContentEntries(entries)],
  };
}

async function loadModrinthContents(
  projectId: string,
  version: IVersion,
): Promise<ModpackContents> {
  const dependencies =
    (await ModManager.getDependencies(
      Provider.MODRINTH,
      projectId,
      version.dependencies.map((dependency) => ({ ...dependency, project: null })),
    )) ?? null;

  if (!dependencies) throw new Error("MODRINTH_DEPENDENCIES_FAILED");

  return {
    items: dependencies
      .filter((dependency) => !!dependency.project)
      .map((dependency) => ({
        key: `${Provider.MODRINTH}:${dependency.projectId}`,
        title: dependency.project?.title || dependency.projectId,
        iconUrl: dependency.project?.iconUrl || null,
        provider: Provider.MODRINTH,
        projectType: dependency.project?.projectType || ProjectType.MOD,
      })),
  };
}

export function getModpackContents(
  provider: Provider,
  projectId: string,
  version: IVersion,
): Promise<ModpackContents> {
  const key = `${provider}:${projectId}:${version.id}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pending =
    provider === Provider.CURSEFORGE
      ? loadCurseForgeContents(version)
      : provider === Provider.MODRINTH
        ? loadModrinthContents(projectId, version)
        : Promise.resolve({ items: [] });

  remember(key, pending);
  pending.catch(() => cache.delete(key));

  return pending;
}
