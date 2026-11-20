import { toast } from "sonner";
import i18n from "@renderer/i18n";
import type { Loader } from "@/types/Loader";
import {
  type ILocalProject,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import type { OptiFineChoice } from "@/shared/optifine";
import type { IModSet } from "@renderer/features/modSets/modSets";
import { resolveModSet } from "@renderer/features/modSets/resolveModSet";
import { portedProjects } from "@renderer/features/port/portPlan";
import { openNewInstance } from "@renderer/features/instances/newInstance";

const api = window.api;

export const SODIUM_PROJECT_ID = "AANobbMI";
export const IRIS_PROJECT_ID = "YL57xq9U";

const SODIUM_IRIS: IModSet = {
  id: "sodium-iris",
  name: "Sodium + Iris",
  createdAt: "",
  updatedAt: "",
  items: [
    {
      provider: Provider.MODRINTH,
      id: SODIUM_PROJECT_ID,
      projectType: ProjectType.MOD,
      title: "Sodium",
      iconUrl: null,
      url: "https://modrinth.com/mod/sodium",
    },
    {
      provider: Provider.MODRINTH,
      id: IRIS_PROJECT_ID,
      projectType: ProjectType.MOD,
      title: "Iris Shaders",
      iconUrl: null,
      url: "https://modrinth.com/mod/iris",
    },
  ],
};

export async function resolveSodiumIris(
  minecraftVersion: string,
  loader: Loader,
): Promise<ILocalProject[]> {
  return portedProjects(
    await resolveModSet(SODIUM_IRIS, { minecraftVersion, loader }, []),
  );
}

export function hasSodiumIris(mods: readonly ILocalProject[]): boolean {
  const ids = new Set(mods.map((mod) => mod.id));
  return ids.has(SODIUM_PROJECT_ID) && ids.has(IRIS_PROJECT_ID);
}

export function openSodiumIrisInstance(minecraft: string): void {
  openNewInstance({
    source: "custom",
    preset: { loader: "fabric", minecraft, sodiumIris: true },
  });
}

export function optifineErrorKey(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("optifineFileMissing")) return "optifine.errors.fileMissing";
  if (message.includes("optifinePatchFailed")) return "optifine.errors.patchFailed";
  if (message.includes("optifineInvalidFile")) return "optifine.errors.invalidFile";
  return null;
}

export async function pickOptiFineFile(
  minecraft: string,
): Promise<OptiFineChoice | null> {
  const paths = await api.other.openFileDialog(
    false,
    [{ name: "OptiFine", extensions: ["jar"] }],
    false,
  );
  const filePath = paths?.[0];
  if (!filePath) return null;

  const result = await api.optifine.import(filePath, minecraft);
  if (result.choice) return result.choice;

  toast.error(
    i18n.t(
      result.error === "wrongVersion"
        ? "optifine.toast.wrongVersion"
        : result.error === "invalid"
          ? "optifine.toast.invalidFile"
          : "optifine.toast.importFailed",
      { version: minecraft },
    ),
  );
  return null;
}
