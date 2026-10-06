import type {
  IVersion as IProjectVersion,
  VersionReleaseType,
} from "@/types/ModManager";
import type { IModpackSource } from "@/types/ModpackSource";

export type ModpackVersionRelation = "current" | "newer" | "older";

export interface ModpackVersionRow {
  version: IProjectVersion;
  relation: ModpackVersionRelation;
  sameGame: boolean;
}

export interface InstalledModpackVersion {
  id: string;
  publishedAt?: string;
  releaseType?: VersionReleaseType;
}

export function installedModpackVersion(
  source: IModpackSource | undefined,
): InstalledModpackVersion {
  return {
    id: source?.versionId ?? "",
    publishedAt: source?.publishedAt,
    releaseType: source?.releaseType,
  };
}

export function modpackVersionLabel(version: IProjectVersion): string {
  return version.versionNumber || version.name;
}

export function runsOnGame(
  version: IProjectVersion,
  gameVersion: string,
): boolean {
  const games = version.gameVersions ?? [];
  return games.length === 0 || games.includes(gameVersion);
}

function timeOf(value: string | undefined): number | null {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : null;
}

function installedOf(
  versions: IProjectVersion[],
  installed: InstalledModpackVersion,
): { time: number | null; releaseType?: VersionReleaseType; listed: boolean } {
  const listed = versions.find((version) => version.id === installed.id);
  if (listed) {
    return {
      time: timeOf(listed.datePublished),
      releaseType: listed.releaseType,
      listed: true,
    };
  }

  return {
    time: timeOf(installed.publishedAt),
    releaseType: installed.releaseType,
    listed: false,
  };
}

export function classifyModpackVersions(
  versions: IProjectVersion[],
  installed: InstalledModpackVersion,
  gameVersion: string,
): ModpackVersionRow[] {
  const current = installedOf(versions, installed);

  return versions.map((version) => {
    const time = timeOf(version.datePublished) ?? 0;

    return {
      version,
      sameGame: runsOnGame(version, gameVersion),
      relation:
        version.id === installed.id
          ? "current"
          : current.time !== null && time <= current.time
            ? "older"
            : "newer",
    };
  });
}

const CHANNEL_RANK = { release: 0, beta: 1, alpha: 2 } as const;

function channelRank(releaseType: VersionReleaseType | undefined): number {
  return CHANNEL_RANK[releaseType ?? "release"] ?? 0;
}

export function findModpackUpdate(
  versions: IProjectVersion[],
  installed: InstalledModpackVersion,
  gameVersion: string,
): IProjectVersion | null {
  const current = installedOf(versions, installed);
  if (!current.listed && current.time === null) return null;

  const allowed = channelRank(current.releaseType);

  return (
    classifyModpackVersions(versions, installed, gameVersion)
      .filter(
        (row) =>
          row.relation === "newer" &&
          row.sameGame &&
          channelRank(row.version.releaseType) <= allowed,
      )
      .map((row) => row.version)
      .sort(
        (a, b) =>
          (timeOf(b.datePublished) ?? 0) - (timeOf(a.datePublished) ?? 0),
      )[0] ?? null
  );
}
