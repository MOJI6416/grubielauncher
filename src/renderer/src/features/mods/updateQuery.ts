import {
  DependencyType,
  ILocalProject,
  IVersion as ModVersion,
  Provider,
} from "@/types/ModManager";
import type {
  IUpdateCheckItem,
  IUpdateVerdict,
  IUpdateVersion,
  UpdateCheckProvider,
} from "@/types/Updates";
import { UPDATE_CHECK_MAX_ITEMS } from "@/types/Updates";
import { entryKey } from "./entries";
import type { UpdateState } from "./updates";

const SHA1_PATTERN = /^[0-9a-f]{40}$/i;

const RELATION_TYPES = new Set<string>([
  DependencyType.REQUIRED,
  DependencyType.OPTIONAL,
  DependencyType.INCOMPATIBLE,
  DependencyType.EMBEDDED,
]);

function checkableProvider(mod: ILocalProject): UpdateCheckProvider | null {
  if (!mod.id) return null;
  if (mod.provider === Provider.CURSEFORGE) return Provider.CURSEFORGE;
  if (mod.provider === Provider.MODRINTH) return Provider.MODRINTH;
  return null;
}

function installedHash(mod: ILocalProject): string | undefined {
  const files = mod.version?.files ?? [];
  const file = files.find((item) => SHA1_PATTERN.test(item.sha1 ?? ""));
  return file?.sha1?.toLowerCase();
}

export function buildUpdateItems(mods: ILocalProject[]): IUpdateCheckItem[] {
  const items: IUpdateCheckItem[] = [];
  const seen = new Set<string>();

  for (const mod of mods) {
    const provider = checkableProvider(mod);
    if (!provider) continue;

    const key = entryKey(provider, mod.id);
    if (seen.has(key)) continue;
    seen.add(key);

    const versionId = mod.version?.id || undefined;
    const hash = installedHash(mod);

    items.push({
      provider,
      id: mod.id,
      projectType: mod.projectType,
      ...(versionId ? { versionId } : {}),
      ...(hash ? { hash } : {}),
    });
  }

  return items;
}

export function chunkUpdateItems(
  items: IUpdateCheckItem[],
  size = UPDATE_CHECK_MAX_ITEMS,
): IUpdateCheckItem[][] {
  const limit = Math.max(1, Math.min(size, UPDATE_CHECK_MAX_ITEMS));
  const chunks: IUpdateCheckItem[][] = [];

  for (let index = 0; index < items.length; index += limit) {
    chunks.push(items.slice(index, index + limit));
  }

  return chunks;
}

export function toModVersion(version: IUpdateVersion): ModVersion {
  return {
    id: version.id,
    name: version.name,
    versionNumber: version.versionNumber,
    dependencies: (version.dependencies ?? [])
      .filter((dependency) => RELATION_TYPES.has(dependency.relationType))
      .map((dependency) => ({
        projectId: String(dependency.projectId),
        versionId: dependency.versionId ?? null,
        project: null,
        relationType: dependency.relationType as DependencyType,
      })),
    downloads: version.downloads ?? 0,
    releaseType: version.releaseType,
    datePublished: version.datePublished,
    gameVersions: version.gameVersions,
    changelog: version.changelog,
    files: version.files ?? [],
  };
}

export function readUpdateVerdicts(
  requested: IUpdateCheckItem[],
  verdicts: IUpdateVerdict[] | null | undefined,
): Map<string, UpdateState> {
  const outcomes = new Map<string, UpdateState>();

  for (const item of requested) {
    outcomes.set(entryKey(item.provider, item.id), {
      status: "unknown",
      latest: null,
    });
  }

  for (const verdict of verdicts ?? []) {
    const key = entryKey(verdict.provider, verdict.id);
    if (!outcomes.has(key)) continue;

    const latest = verdict.latest ? toModVersion(verdict.latest) : null;

    if (verdict.status === "update" || verdict.status === "current") {
      outcomes.set(
        key,
        latest
          ? { status: verdict.status, latest }
          : { status: "unknown", latest: null },
      );
      continue;
    }

    if (verdict.status === "unavailable") {
      outcomes.set(key, { status: "unavailable", latest: null });
      continue;
    }

    outcomes.set(key, { status: "unknown", latest: null });
  }

  return outcomes;
}
