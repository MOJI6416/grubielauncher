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

  if (instanceLoader === "legacy-fabric") return [instanceLoader, "fabric"];

  return [];
}

export function catalogLoaderHintKey(
  instanceLoader: Loader | undefined,
): string {
  if (instanceLoader === "quilt") return "modManager.catalogLoaderHintQuilt";
  if (instanceLoader === "legacy-fabric") {
    return "modManager.catalogLoaderHintLegacyFabric";
  }
  return "modManager.catalogLoaderHint";
}

export function sharedTagLoader(
  instanceLoader: Loader | undefined,
  requested: Loader,
  projectType: ProjectType,
): Loader | undefined {
  if (instanceLoader !== "legacy-fabric" || projectType !== ProjectType.MOD) {
    return undefined;
  }
  if (requested === "legacy-fabric") return "fabric";
  return requested === "fabric" ? "legacy-fabric" : undefined;
}

export function skipsDependencies(
  instanceLoader: Loader | undefined,
  installLoader: Loader | undefined,
): boolean {
  if (!installLoader || installLoader === instanceLoader) return false;
  return instanceLoader !== "legacy-fabric";
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
