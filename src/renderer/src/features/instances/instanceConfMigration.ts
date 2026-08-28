import type { IVersionConf } from "@/types/IVersion";

export interface InstanceConfMigration {
  dropEmptyShareCode: boolean;
}

export function planInstanceConfMigration(
  conf: Pick<IVersionConf, "shareCode">,
): InstanceConfMigration {
  return { dropEmptyShareCode: conf.shareCode === "" };
}

export function isEmptyMigration(migration: InstanceConfMigration): boolean {
  return !migration.dropEmptyShareCode;
}

export function applyInstanceConfMigration(
  conf: IVersionConf,
  migration: InstanceConfMigration,
): void {
  if (!migration.dropEmptyShareCode) return;

  conf.shareCode = undefined;
  conf.build = 0;
}
