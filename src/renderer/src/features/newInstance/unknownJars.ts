import {
  ProjectType,
  Provider,
  type ICatalogPresenceItem,
  type ICatalogPresenceResult,
  type ILocalProject,
} from "@/types/ModManager";
import { modpackProjectKey } from "@/shared/modpackMerge";
import type { AppliedPack } from "./state";

export interface UnknownJar {
  key: string;
  checked: boolean;
}

type Join = (...parts: string[]) => string | Promise<string>;

const DISABLED = ".disabled";

export function jarCandidates(mods: ILocalProject[]): ILocalProject[] {
  return mods.filter(
    (mod) =>
      mod.projectType === ProjectType.MOD &&
      (mod.provider === Provider.LOCAL || mod.provider === Provider.OTHER) &&
      Boolean(mod.version?.files[0]?.filename),
  );
}

async function packFilePath(
  mod: ILocalProject,
  pack: AppliedPack,
  join: Join,
): Promise<string | undefined> {
  const file = mod.version?.files[0];
  if (!file) return undefined;
  if (file.localPath) return file.localPath;
  if (!pack.importData) return undefined;
  return join(
    pack.importData.path,
    "mods",
    file.disabled ? `${file.filename}${DISABLED}` : file.filename,
  );
}

export async function presenceItems(
  mods: ILocalProject[],
  pack: AppliedPack,
  join: Join,
): Promise<ICatalogPresenceItem[]> {
  return Promise.all(
    jarCandidates(mods).map(async (mod) => {
      const file = mod.version!.files[0];
      const path = await packFilePath(mod, pack, join);
      const url = /^https?:\/\//i.test(file.url) ? file.url : undefined;
      return {
        key: modpackProjectKey(mod),
        ...(file.sha1 ? { sha1: file.sha1 } : {}),
        ...(path ? { path } : {}),
        ...(url ? { url } : {}),
      };
    }),
  );
}

export function unknownJarsOf(result: ICatalogPresenceResult): UnknownJar[] {
  return [
    ...result.unknown.map((key) => ({ key, checked: true })),
    ...result.unchecked.map((key) => ({ key, checked: false })),
  ];
}

export function skippedJarKeys(
  unknown: UnknownJar[],
  install: ReadonlySet<string>,
): Set<string> {
  return new Set(
    unknown.map((jar) => jar.key).filter((key) => !install.has(key)),
  );
}

export function withoutSkipped(
  mods: ILocalProject[],
  skipped: ReadonlySet<string>,
): ILocalProject[] {
  if (skipped.size === 0) return mods;
  return mods.filter((mod) => !skipped.has(modpackProjectKey(mod)));
}

export async function skippedJarFiles(
  mods: ILocalProject[],
  skipped: ReadonlySet<string>,
  pack: AppliedPack,
  join: Join,
): Promise<string[]> {
  const paths: string[] = [];
  for (const mod of jarCandidates(mods)) {
    if (!skipped.has(modpackProjectKey(mod))) continue;
    const file = mod.version!.files[0];
    if (file.localPath) {
      paths.push(file.localPath, `${file.localPath}${DISABLED}`);
    } else if (pack.importData) {
      const base = await join(pack.importData.path, "mods", file.filename);
      paths.push(base, `${base}${DISABLED}`);
    }
  }
  return paths;
}
