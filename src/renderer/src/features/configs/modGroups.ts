import {
  ILocalProject,
  LocalModDependencyIndex,
  ProjectType,
} from "@/types/ModManager";
import type { ConfigEntry } from "./configFiles";

export interface ModIdentity {
  key: string;
  title: string;
  iconUrl: string | null;
  ids: string[];
}

export interface ConfigGroup {
  key: string;
  title: string;
  iconUrl: string | null;
  isMod: boolean;
  entries: ConfigEntry[];
}

export const OTHER_GROUP_KEY = "other";

const IGNORED_IDS = new Set(
  [
    "minecraft",
    "java",
    "forge",
    "neoforge",
    "fabric",
    "fabricloader",
    "fabric-api",
    "fabric-api-base",
    "quilt_loader",
    "quilted_fabric_api",
    "mixinextras",
  ].map((id) => id.toLowerCase().replace(/[^a-z0-9]/g, "")),
);

const ROOT_PREFIXES = ["defaultconfigs/", "scripts/"];
const MIN_ID_LENGTH = 3;

export function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function modIdentities(
  mods: ILocalProject[],
  index: LocalModDependencyIndex,
): ModIdentity[] {
  return mods
    .filter((mod) => mod.projectType === ProjectType.MOD)
    .map((mod) => {
      const files = mod.version?.files ?? [];
      const fromJar = files.flatMap(
        (file) =>
          index[file.filename.replace(/\.disabled$/i, "").toLowerCase()]
            ?.provides ?? [],
      );
      const ids = [...fromJar, mod.title]
        .map(normalizeId)
        .filter((id) => id.length >= MIN_ID_LENGTH && !IGNORED_IDS.has(id));

      return {
        key: `${mod.provider}:${mod.id}`,
        title: mod.title,
        iconUrl: mod.iconUrl,
        ids: [...new Set(ids)],
      };
    })
    .filter((identity) => identity.ids.length > 0);
}

function stripExtension(name: string): string {
  return name.replace(/(?:\.[a-z0-9]+)+$/i, "");
}

export function configCandidates(relative: string): string[] {
  const path = ROOT_PREFIXES.reduce(
    (current, prefix) =>
      current.startsWith(prefix) ? current.slice(prefix.length) : current,
    relative,
  );
  const segments = path.split("/");
  const fileBase = stripExtension(segments[segments.length - 1]);
  const candidates: string[] = [];

  const addPrefixes = (value: string) => {
    const parts = value.split(/[-_.\s]+/).filter(Boolean);
    for (let count = parts.length; count >= 1; count--) {
      candidates.push(parts.slice(0, count).join(""));
    }
  };

  if (segments.length > 1) addPrefixes(segments[0]);
  addPrefixes(fileBase);

  return [...new Set(candidates.map(normalizeId))].filter(
    (candidate) => candidate.length >= MIN_ID_LENGTH,
  );
}

export function matchConfig(
  relative: string,
  byId: ReadonlyMap<string, ModIdentity>,
): ModIdentity | null {
  for (const candidate of configCandidates(relative)) {
    const identity = byId.get(candidate);
    if (identity) return identity;
  }
  return null;
}

export function groupConfigs(
  entries: ConfigEntry[],
  identities: ModIdentity[],
  otherTitle: string,
): ConfigGroup[] {
  const byId = new Map<string, ModIdentity>();
  for (const identity of identities) {
    for (const id of identity.ids) if (!byId.has(id)) byId.set(id, identity);
  }

  const groups = new Map<string, ConfigGroup>();
  const other: ConfigGroup = {
    key: OTHER_GROUP_KEY,
    title: otherTitle,
    iconUrl: null,
    isMod: false,
    entries: [],
  };

  for (const entry of entries) {
    const identity = matchConfig(entry.relative, byId);
    if (!identity) {
      other.entries.push(entry);
      continue;
    }

    const group = groups.get(identity.key) ?? {
      key: identity.key,
      title: identity.title,
      iconUrl: identity.iconUrl,
      isMod: true,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(identity.key, group);
  }

  const sorted = [...groups.values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  return other.entries.length ? [...sorted, other] : sorted;
}
