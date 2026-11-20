import type {
  ICatalogPresenceItem,
  ILocalProject,
} from "@/types/ModManager";
import { modpackProjectKey } from "@/shared/modpackMerge";
import type { PackContentItem } from "@renderer/features/newInstance/PackContentList";
import {
  jarCandidates,
  type UnknownJar,
} from "@renderer/features/newInstance/unknownJars";
import type { PreparedModpackUpdate } from "./modpackUpdate";

export function incomingJars(update: PreparedModpackUpdate): ILocalProject[] {
  return jarCandidates([
    ...update.merge.added,
    ...update.merge.updated.map((item) => item.to),
  ]);
}

export function updatePresenceItems(
  update: PreparedModpackUpdate,
): ICatalogPresenceItem[] {
  return incomingJars(update).map((mod) => {
    const file = mod.version!.files[0];
    const url = /^https?:\/\//i.test(file.url) ? file.url : undefined;
    return {
      key: modpackProjectKey(mod),
      ...(file.sha1 ? { sha1: file.sha1 } : {}),
      ...(file.localPath ? { path: file.localPath } : {}),
      ...(url ? { url } : {}),
    };
  });
}

export function unknownJarItems(
  update: PreparedModpackUpdate,
  unknown: readonly UnknownJar[],
  install: ReadonlySet<string>,
): PackContentItem[] {
  const byKey = new Map(unknown.map((jar) => [jar.key, jar]));
  return incomingJars(update)
    .filter((mod) => byKey.has(modpackProjectKey(mod)))
    .map((mod) => {
      const key = modpackProjectKey(mod);
      return {
        key,
        title: mod.title || mod.version?.files[0]?.filename || key,
        iconUrl: mod.iconUrl,
        provider: mod.provider,
        projectType: mod.projectType,
        unknown: byKey.get(key)?.checked ? "unknown" : "unchecked",
        install: install.has(key),
      };
    });
}

export function skipUnknownJars(
  update: PreparedModpackUpdate,
  skipped: ReadonlySet<string>,
): PreparedModpackUpdate {
  if (skipped.size === 0) return update;
  const previous = new Map(
    update.merge.updated.map((item) => [item.to, item.from]),
  );
  const isSkipped = (mod: ILocalProject) => skipped.has(modpackProjectKey(mod));
  const mods = update.merge.mods.flatMap((mod) => {
    if (!isSkipped(mod)) return [mod];
    const from = previous.get(mod);
    return from ? [from] : [];
  });
  return {
    ...update,
    merge: {
      ...update.merge,
      mods,
      added: update.merge.added.filter((mod) => !isSkipped(mod)),
      updated: update.merge.updated.filter((item) => !isSkipped(item.to)),
    },
  };
}
