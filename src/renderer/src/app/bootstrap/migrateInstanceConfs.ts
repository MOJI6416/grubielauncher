import type { Version } from "@renderer/classes/Version";
import {
  applyInstanceConfMigration,
  isEmptyMigration,
  planInstanceConfMigration,
} from "@renderer/features/instances/instanceConfMigration";
import {
  readLauncherState,
  writeLauncherState,
} from "@renderer/utilities/launcherState";

export async function migrateInstanceConfs(
  launcherPath: string,
  instances: Version[],
): Promise<number> {
  if (!launcherPath) return 0;

  const state = await readLauncherState(launcherPath);
  if (state?.instanceConfCleanup) return 0;

  let migrated = 0;

  for (const instance of instances) {
    try {
      const migration = planInstanceConfMigration(instance.version);
      if (isEmptyMigration(migration)) continue;

      applyInstanceConfMigration(instance.version, migration);
      await instance.save();
      migrated += 1;
    } catch (error) {
      console.error(
        `[instances] conf migration failed for ${instance.version.name}`,
        error,
      );
      return migrated;
    }
  }

  await writeLauncherState(launcherPath, {
    ...(state || {}),
    instanceConfCleanup: true,
  });

  return migrated;
}
