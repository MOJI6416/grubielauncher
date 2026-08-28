import type { ILocalAccount } from "@/types/Account";
import { isOwner, parseVersionOwner } from "@renderer/utilities/versionPure";

export interface DeleteGatesInput {
  shareCode?: string;
  downloadedVersion?: boolean;
  owner?: string;
  ownerId?: string;
  account?: ILocalAccount | null;
  shareDel: boolean;
  canRequestRemoteDelete: boolean;
}

export function getDeleteGates(input: DeleteGatesInput) {
  const account = input.account ?? undefined;
  const hasShare = !!input.shareCode;
  const hasOwnerRecord = !!input.owner || !!input.ownerId;
  const ownedByAccount =
    !!account &&
    (!hasOwnerRecord || isOwner(input.owner, account, input.ownerId));

  const publicationOwner =
    hasShare && !!account && hasOwnerRecord && !ownedByAccount
      ? parseVersionOwner(input.owner)
      : null;

  const canOfferRemoteDelete =
    hasShare && !input.downloadedVersion && ownedByAccount;

  const canDeleteRemote =
    canOfferRemoteDelete && input.shareDel && input.canRequestRemoteDelete;

  return { publicationOwner, canOfferRemoteDelete, canDeleteRemote };
}
