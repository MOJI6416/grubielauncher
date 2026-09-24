import { Loader } from "@/types/Loader";
import { ILocalProject, ProjectType } from "@/types/ModManager";
import { normalizeProjectTitle } from "@renderer/utilities/mod";

const CONNECTOR_IDS = new Set(["u58R1TMW", "890127", "connector"]);

export function catalogLoaderOptions(
  instanceLoader: Loader | undefined,
  projectType: ProjectType,
): Loader[] {
  if (projectType !== ProjectType.MOD || !instanceLoader) return [];

  if (
    instanceLoader === "forge" ||
    instanceLoader === "neoforge" ||
    instanceLoader === "quilt"
  ) {
    return [instanceLoader, "fabric"];
  }

  return [];
}

export function needsConnector(
  instanceLoader: Loader | undefined,
  browseLoader: Loader | undefined,
): boolean {
  return (
    browseLoader === "fabric" &&
    (instanceLoader === "forge" || instanceLoader === "neoforge")
  );
}

export function hasConnector(mods: ILocalProject[]): boolean {
  return mods.some(
    (mod) =>
      CONNECTOR_IDS.has(mod.id) ||
      normalizeProjectTitle(mod.title) === "sinytraconnector",
  );
}
