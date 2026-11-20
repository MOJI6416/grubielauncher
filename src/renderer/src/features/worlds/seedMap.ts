const CHUNKBASE = "https://www.chunkbase.com/apps/seed-map";

const RELEASE = /^1\.(\d+)(?:\.(\d+))?/;
const YEARLY = /^(\d{2})\.(\d+)/;
const LEGACY = /^(?:rd-|inf-|c0\.|a1\.|b1\.)/i;
const SNAPSHOT = /^\d{2}w\d{2}/i;

const LATEST_YEARLY = { year: 26, drop: 4 };

const RANGES_1_21: [number, string][] = [
  [9, "java_1_21_9"],
  [6, "java_1_21_6"],
  [5, "java_1_21_5"],
  [4, "java_1_21_4"],
  [2, "java_1_21_2"],
  [0, "java_1_21"],
];

const RANGES_1_19: [number, string][] = [
  [3, "java_1_19_3"],
  [0, "java_1_19"],
];

export type SeedMapPlatform = string | null | "unsupported";

export function chunkbasePlatform(version: string | undefined): SeedMapPlatform {
  const id = version?.trim().toLowerCase();
  if (!id || SNAPSHOT.test(id)) return null;
  if (LEGACY.test(id)) return "unsupported";

  const release = RELEASE.exec(id);
  if (release) {
    const minor = Number(release[1]);
    const patch = Number(release[2] ?? 0);
    if (minor < 7) return "unsupported";
    if (minor === 21) {
      return RANGES_1_21.find(([from]) => patch >= from)?.[1] ?? "java_1_21";
    }
    if (minor === 19) {
      return RANGES_1_19.find(([from]) => patch >= from)?.[1] ?? "java_1_19";
    }
    return minor > 21 ? null : `java_1_${minor}`;
  }

  const yearly = YEARLY.exec(id);
  if (yearly) {
    const year = Number(yearly[1]);
    const drop = Number(yearly[2]);
    if (year === LATEST_YEARLY.year && drop >= 1 && drop <= LATEST_YEARLY.drop) {
      return `java_${year}_${drop}`;
    }
    return null;
  }

  return null;
}

export function seedMapUrl({
  seed,
  version,
  spawn,
}: {
  seed: string;
  version: string | undefined;
  spawn?: { x: number; z: number };
}): string | null {
  const value = seed.trim();
  if (!/^-?\d+$/.test(value)) return null;

  const platform = chunkbasePlatform(version);
  if (platform === "unsupported") return null;

  const params = [`seed=${value}`];
  if (platform) params.push(`platform=${platform}`);
  params.push("dimension=overworld");
  if (spawn && Number.isFinite(spawn.x) && Number.isFinite(spawn.z)) {
    params.push(`x=${Math.round(spawn.x)}`, `z=${Math.round(spawn.z)}`);
  }

  return `${CHUNKBASE}#${params.join("&")}`;
}
