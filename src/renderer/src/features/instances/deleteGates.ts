import type { ILocalAccount } from "@/types/Account";
import { isOwner, parseVersionOwner } from "@renderer/utilities/versionPure";

export interface ForeignPublicationInput {
  shareCode?: string;
  owner?: string;
  ownerId?: string;
  account?: ILocalAccount | null;
}

export interface DeleteGatesInput extends ForeignPublicationInput {
  downloadedVersion?: boolean;
  shareDel: boolean;
  canRequestRemoteDelete: boolean;
}

export interface DeleteCopy {
  titleKey: string;
  descriptionKey: string;
  confirmKey: string;
  menuKey: string;
  trashedKey: string;
  trashedHintKey: string;
  deletedKey: string;
  deletedHintKey: string;
  ownerNoteKey: string | null;
}

export function isForeignPublication(input: ForeignPublicationInput): boolean {
  const account = input.account ?? undefined;
  if (!account || !input.shareCode) return false;

  const hasOwnerRecord = !!input.owner || !!input.ownerId;
  if (!hasOwnerRecord) return false;

  return !isOwner(input.owner, account, input.ownerId);
}

export function getDeleteGates(input: DeleteGatesInput) {
  const account = input.account ?? undefined;
  const hasShare = !!input.shareCode;
  const hasOwnerRecord = !!input.owner || !!input.ownerId;
  const ownedByAccount =
    !!account &&
    (!hasOwnerRecord || isOwner(input.owner, account, input.ownerId));

  const foreignPublication = isForeignPublication(input);

  const publicationOwner = foreignPublication
    ? parseVersionOwner(input.owner)
    : null;

  const canOfferRemoteDelete =
    hasShare && !input.downloadedVersion && ownedByAccount;

  const canDeleteRemote =
    canOfferRemoteDelete && input.shareDel && input.canRequestRemoteDelete;

  return {
    publicationOwner,
    foreignPublication,
    canOfferRemoteDelete,
    canDeleteRemote,
  };
}

export function getDeleteCopy(gates: {
  foreignPublication: boolean;
  publicationOwner?: { nickname: string } | null;
}): DeleteCopy {
  if (!gates.foreignPublication) {
    return {
      titleKey: "common.deletion",
      descriptionKey: "versions.savesInfo",
      confirmKey: "common.delete",
      menuKey: "versions.deleteInstance",
      trashedKey: "versions.trashed",
      trashedHintKey: "versions.trashedHint",
      deletedKey: "versions.deleted",
      deletedHintKey: "versions.deletedHint",
      ownerNoteKey: null,
    };
  }

  return {
    titleKey: "versions.deleteCopy.title",
    descriptionKey: "versions.deleteCopy.info",
    confirmKey: "versions.deleteCopy.confirm",
    menuKey: "versions.deleteCopy.menu",
    trashedKey: "versions.deleteCopy.trashed",
    trashedHintKey: "versions.deleteCopy.trashedHint",
    deletedKey: "versions.deleteCopy.deleted",
    deletedHintKey: "versions.deleteCopy.deletedHint",
    ownerNoteKey: gates.publicationOwner
      ? "versions.deleteBlocked.notOwner"
      : "versions.deleteBlocked.notOwnerUnknown",
  };
}
