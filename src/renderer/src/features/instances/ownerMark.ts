import type { ILocalAccount } from "@/types/Account";
import type { Version } from "@renderer/classes/Version";
import { isOwner, parseVersionOwner } from "@renderer/utilities/versionPure";

export interface OwnerMarkInfo {
  nickname: string;
  image?: string;
}

export function resolveOwnerMark(
  instance: Version,
  account: ILocalAccount | null | undefined,
  accounts: ILocalAccount[] | null | undefined,
): OwnerMarkInfo | null {
  if (
    isOwner(
      instance.version.owner,
      account ?? undefined,
      instance.version.ownerId,
    )
  ) {
    return null;
  }

  const owner = parseVersionOwner(instance.version.owner);
  if (!owner) return null;

  const known = accounts?.find(
    (entry) => entry.type === owner.type && entry.nickname === owner.nickname,
  );

  return { nickname: owner.nickname, image: known?.image };
}
