import type { IModpack } from "@/types/Backend";
import type { Version } from "@renderer/classes/Version";
import { packShareCode } from "@renderer/features/profile/ownPacks";

type PackIdentity = Pick<IModpack, "_id" | "shareCode">;

export function packIdentityKeys(modpack: PackIdentity): string[] {
  const keys = [packShareCode(modpack), modpack._id];
  return [...new Set(keys.filter((key): key is string => !!key))];
}

export function instanceMatchesPack(
  shareCode: string | undefined,
  modpack: PackIdentity,
): boolean {
  if (!shareCode) return false;
  return packIdentityKeys(modpack).includes(shareCode);
}

export function findInstanceForPack<
  T extends { version: { shareCode?: string } },
>(instances: T[], modpack: PackIdentity): T | undefined {
  const keys = packIdentityKeys(modpack);

  for (const key of keys) {
    const found = instances.find(
      (instance) => instance.version.shareCode === key,
    );
    if (found) return found;
  }

  return undefined;
}

export async function adoptCanonicalShareCode(
  instance: Version,
  modpack: PackIdentity,
): Promise<boolean> {
  const canonical = packShareCode(modpack);
  const current = instance.version.shareCode;

  if (!canonical || !current || current === canonical) return false;
  if (!instanceMatchesPack(current, modpack)) return false;

  instance.version.shareCode = canonical;
  await instance.save();

  return true;
}
