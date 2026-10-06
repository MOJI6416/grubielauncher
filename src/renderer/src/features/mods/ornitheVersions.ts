import type { ILocalFile, IVersion as ModVersion } from "@/types/ModManager";

const SEARCH_DEPTH = 40;

type VersionFiles = { files: ILocalFile[] };

export type GenerationProbe = (
  version: VersionFiles,
) => Promise<number | null | undefined>;

export async function findGenerationVersion(
  versions: ModVersion[],
  target: number,
  generationOf: GenerationProbe,
): Promise<ModVersion | undefined> {
  if (!versions.length) return undefined;

  const fits = async (version: ModVersion) => {
    const generation = await generationOf(version);
    return generation === null || generation === target;
  };

  if (await fits(versions[0])) return versions[0];

  const bound = Math.min(versions.length, SEARCH_DEPTH);
  let low = 1;
  let high = bound;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (await fits(versions[middle])) high = middle;
    else low = middle + 1;
  }

  return low < bound && (await fits(versions[low]))
    ? versions[low]
    : versions[0];
}

export interface OrnitheVersionGuard {
  pick: (
    versions: ModVersion[],
    requiredBy?: ModVersion,
  ) => Promise<ModVersion | undefined>;
  keepsGeneration: (
    current: VersionFiles,
    next: VersionFiles,
  ) => Promise<boolean>;
}

export function createOrnitheVersionGuard({
  minecraftVersion,
  instanceGeneration,
  probe,
}: {
  minecraftVersion: string;
  instanceGeneration: number;
  probe: (
    url: string,
    sha1: string | undefined,
    minecraftVersion: string,
  ) => Promise<{ generation: number | null } | null>;
}): OrnitheVersionGuard {
  const cache = new Map<string, Promise<number | null | undefined>>();

  const generationOf: GenerationProbe = (version) => {
    const file = version.files.find((item) => item.url);
    if (!file) return Promise.resolve(undefined);

    let cached = cache.get(file.url);
    if (!cached) {
      cached = probe(file.url, file.sha1 || undefined, minecraftVersion)
        .then((result) => (result ? result.generation : undefined))
        .catch(() => undefined);
      cache.set(file.url, cached);
    }
    return cached;
  };

  return {
    pick: async (versions, requiredBy) => {
      const parent = requiredBy ? await generationOf(requiredBy) : undefined;
      const target = typeof parent === "number" ? parent : instanceGeneration;
      return findGenerationVersion(versions, target, generationOf);
    },
    keepsGeneration: async (current, next) => {
      const [before, after] = await Promise.all([
        generationOf(current),
        generationOf(next),
      ]);
      return (
        typeof before !== "number" ||
        typeof after !== "number" ||
        before === after
      );
    },
  };
}
