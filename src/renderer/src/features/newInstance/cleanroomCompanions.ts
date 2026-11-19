import type { Loader } from "@/types/Loader";
import {
  type ILocalProject,
  type IVersion as ModVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { toLocalProject } from "@renderer/features/mods/updates";
import {
  buildInstalledIndex,
  findInstalledProject,
  type InstalledIndex,
} from "@renderer/utilities/mod";

const api = window.api;

interface CleanroomCompanion {
  provider: Provider;
  id: string;
  titles: string[];
}

const CLEANROOM_COMPANIONS: readonly CleanroomCompanion[] = [
  { provider: Provider.MODRINTH, id: "vylTACsh", titles: ["Fugue"] },
  {
    provider: Provider.CURSEFORGE,
    id: "1235372",
    titles: ["Scalar", "Scalar Legacy"],
  },
];

export interface CompanionRequest {
  loader: Loader;
  pack: unknown;
  mods: ILocalProject[];
  minecraftVersion: { id: string };
}

export function pickCompanionVersion(
  versions: readonly ModVersion[],
): ModVersion | null {
  return (
    versions.find(
      (version) =>
        version.releaseType === "release" &&
        version.files.length === 1 &&
        /\.jar$/i.test(version.files[0].filename) &&
        !version.files[0].url.startsWith("blocked::"),
    ) ?? null
  );
}

function isPresent(index: InstalledIndex, companion: CleanroomCompanion) {
  return companion.titles.some((title) =>
    findInstalledProject(index, {
      provider: companion.provider,
      id: companion.id,
      title,
    }),
  );
}

async function resolveCompanion(
  companion: CleanroomCompanion,
  minecraftVersion: string,
): Promise<ILocalProject | null> {
  try {
    const project = await api.modManager.getProject(
      companion.provider,
      companion.id,
    );
    if (!project) throw new Error("project not found");

    const version = pickCompanionVersion(
      await api.modManager.getVersions(companion.provider, companion.id, {
        loader: "cleanroom",
        version: minecraftVersion,
        projectType: ProjectType.MOD,
        modUrl: project.url,
      }),
    );
    if (!version) throw new Error("no release file for this game version");

    return toLocalProject(project, version);
  } catch (error) {
    console.error(
      `[cleanroom] ${companion.provider}:${companion.id} was not added to the new instance:`,
      error,
    );
    return null;
  }
}

export async function withCleanroomCompanions(
  request: CompanionRequest,
): Promise<ILocalProject[]> {
  if (request.loader !== "cleanroom" || request.pack) return request.mods;

  const index = buildInstalledIndex(request.mods);
  const added = await Promise.all(
    CLEANROOM_COMPANIONS.filter(
      (companion) => !isPresent(index, companion),
    ).map((companion) =>
      resolveCompanion(companion, request.minecraftVersion.id),
    ),
  );

  return [
    ...request.mods,
    ...added.filter((mod): mod is ILocalProject => mod !== null),
  ];
}
