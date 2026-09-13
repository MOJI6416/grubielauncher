import { ProjectType } from "@/types/ModManager";
import type { ILocalProject } from "@/types/ModManager";
import { ServerCore } from "@/types/Server";
import type { VersionInstallStage } from "@/types/InstallationProgress";

export type ContentStage = "mods" | "packs" | "worlds";

export const VERSION_FILE_STAGES: readonly VersionInstallStage[] = [
  "preparing",
  "manifest",
  "java",
  "loader",
  "assets",
  "files",
];

export const SERVER_FILE_STAGES: readonly VersionInstallStage[] = [
  "preparing",
  "java",
  "files",
  "installer",
  "loader",
];

const CONTENT_STAGES: readonly ContentStage[] = ["mods", "packs", "worlds"];

const MODDED_SERVER_CORES: readonly string[] = [
  ServerCore.FABRIC,
  ServerCore.QUILT,
  ServerCore.FORGE,
  ServerCore.NEOFORGE,
];

export function isModdedServerCore(core: string | null | undefined): boolean {
  return !!core && MODDED_SERVER_CORES.includes(core);
}

export function contentStageOf(projectType: ProjectType): ContentStage {
  switch (projectType) {
    case ProjectType.RESOURCEPACK:
    case ProjectType.SHADER:
    case ProjectType.DATAPACK:
      return "packs";
    case ProjectType.WORLD:
      return "worlds";
    default:
      return "mods";
  }
}

export function contentPlan(
  projects: readonly Pick<ILocalProject, "projectType" | "version">[],
  server?: { core: string } | null,
): VersionInstallStage[] {
  const present = new Set<ContentStage>();

  for (const project of projects) {
    if (!project.version?.files.length) continue;
    if (project.projectType === ProjectType.PLUGIN && !server) continue;
    present.add(contentStageOf(project.projectType));
  }

  const plan: VersionInstallStage[] = CONTENT_STAGES.filter((stage) =>
    present.has(stage),
  );

  if (isModdedServerCore(server?.core)) plan.push("serverMods");
  plan.push("cleanup");

  return plan;
}
