import type { IVersionConf } from "@/types/IVersion";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";

export const INSTANCE_CONF_REVISION = 2;

export interface InstanceConfMigration {
  dropEmptyShareCode: boolean;
  jarPacks: number;
}

const PACK_TYPES = new Set<ProjectType>([
  ProjectType.RESOURCEPACK,
  ProjectType.SHADER,
  ProjectType.DATAPACK,
]);

function isJarPack(mod: ILocalProject): boolean {
  return (
    (mod.provider === Provider.LOCAL || mod.provider === Provider.OTHER) &&
    PACK_TYPES.has(mod.projectType) &&
    (mod.version?.files ?? []).some((file) =>
      /\.jar(\.disabled)?$/i.test(file.filename ?? ""),
    )
  );
}

export function planInstanceConfMigration(
  conf: Pick<IVersionConf, "shareCode"> & {
    loader?: Pick<IVersionConf["loader"], "name" | "mods">;
  },
): InstanceConfMigration {
  const isModded = !!conf.loader && conf.loader.name !== "vanilla";

  return {
    dropEmptyShareCode: conf.shareCode === "",
    jarPacks: isModded ? (conf.loader?.mods ?? []).filter(isJarPack).length : 0,
  };
}

export function isEmptyMigration(migration: InstanceConfMigration): boolean {
  return !migration.dropEmptyShareCode && migration.jarPacks === 0;
}

export function applyInstanceConfMigration(
  conf: IVersionConf,
  migration: InstanceConfMigration,
): void {
  if (migration.dropEmptyShareCode) {
    conf.shareCode = undefined;
    conf.build = 0;
  }

  if (migration.jarPacks > 0) {
    for (const mod of conf.loader.mods ?? []) {
      if (isJarPack(mod)) mod.projectType = ProjectType.MOD;
    }
  }
}
