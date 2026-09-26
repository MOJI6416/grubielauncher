import {
  ILocalIdentifyMatch,
  ILocalProject,
  Provider,
} from "@/types/ModManager";
import { Loader } from "@/types/Loader";
import { getLocalPathFromFileUrl } from "@renderer/utilities/exportVersion";
import { sharesFile } from "@renderer/utilities/mod";
import { ContentEntry, entryKey } from "./entries";
import { toLocalProject } from "./updates";

export function isIdentifiable(entry: ContentEntry): boolean {
  return (
    (entry.provider === Provider.LOCAL || entry.provider === Provider.OTHER) &&
    !entry.pendingRemoved &&
    Boolean(entry.installed?.version?.files.length) &&
    Boolean(entry.fileName)
  );
}

const MOD_LOADERS: Loader[] = ["neoforge", "forge", "fabric", "quilt"];

export function foreignLoader(
  loaders: string[],
  instanceLoader: Loader | undefined,
): Loader | undefined {
  if (!instanceLoader || instanceLoader === "vanilla") return undefined;

  const normalized = loaders.map((loader) => loader.toLowerCase());
  if (normalized.length === 0 || normalized.includes(instanceLoader)) {
    return undefined;
  }

  return MOD_LOADERS.find((loader) => normalized.includes(loader));
}

export interface LinkResult {
  mods: ILocalProject[];
  linked: string[];
}

export function linkIdentified(
  mods: ILocalProject[],
  matches: ILocalIdentifyMatch[],
  disabledKeys: ReadonlySet<string>,
  instanceLoader?: Loader,
): LinkResult {
  const byKey = new Map(matches.map((match) => [match.key, match]));
  const taken = new Set(mods.map((mod) => entryKey(mod.provider, mod.id)));
  const linked: string[] = [];
  const merged = new Set<string>();

  const next = mods.map((mod) => {
    const key = entryKey(mod.provider, mod.id);
    const match = byKey.get(key);
    if (!match) return mod;

    const twin = mods.some(
      (other) =>
        other !== mod &&
        !merged.has(entryKey(other.provider, other.id)) &&
        sharesFile(other, mod),
    );
    if (twin) {
      merged.add(key);
      linked.push(key);
      return mod;
    }

    const target = entryKey(match.provider, match.project.id);
    if (taken.has(target)) return mod;

    const localFile = mod.version?.files[0];
    const catalogFile = match.version.files[0];
    if (!localFile || !catalogFile) return mod;

    const disabled =
      disabledKeys.has(key) ||
      mod.version?.files.some((file) => file.disabled === true) === true;

    const localPath = catalogFile.url.startsWith("blocked::")
      ? localFile.localPath || getLocalPathFromFileUrl(localFile.url)
      : "";

    const project = toLocalProject(
      match.project,
      {
        ...match.version,
        files: [
          {
            ...catalogFile,
            filename: localFile.filename,
            ...(localPath ? { localPath } : {}),
          },
        ],
      },
      {
        disabled,
        keepLocalPath: Boolean(localPath),
        loader: foreignLoader(match.loaders, instanceLoader),
      },
    );

    taken.add(target);
    linked.push(key);

    return { ...project, updatedAt: mod.updatedAt };
  });

  return {
    mods: next.filter((mod) => !merged.has(entryKey(mod.provider, mod.id))),
    linked,
  };
}
