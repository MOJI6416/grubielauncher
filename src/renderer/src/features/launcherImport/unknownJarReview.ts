import type { ILocalProject } from "@/types/ModManager";
import { modpackProjectKey } from "@/shared/modpackMerge";
import { jarCandidates } from "@renderer/features/newInstance/unknownJars";

export interface ImportUnknownJar {
  key: string;
  title: string;
  fileName: string;
  checked: boolean;
}

export function importUnknownJars(
  mods: ILocalProject[],
  catalogChecked: boolean,
): ImportUnknownJar[] {
  return jarCandidates(mods).map((mod) => {
    const fileName = mod.version!.files[0].filename;
    return {
      key: modpackProjectKey(mod),
      title: mod.title || fileName,
      fileName,
      checked: catalogChecked,
    };
  });
}

export function skippedFileNames(
  unknown: readonly ImportUnknownJar[],
  skipped: ReadonlySet<string>,
): string[] {
  return unknown
    .filter((jar) => skipped.has(jar.key))
    .flatMap((jar) => [jar.fileName, `${jar.fileName}.disabled`]);
}
