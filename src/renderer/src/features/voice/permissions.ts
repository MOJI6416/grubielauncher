import type { IGroup } from "@/types/Voice";

export type MemberAction = "transferOwner" | "kick" | "ban";

export interface GroupPermissions {
  canRename: boolean;
  canResetCode: boolean;
  canDelete: boolean;
  canLeave: boolean;
  canInvite: boolean;
  canModerate: boolean;
}

export function groupPermissions(group: IGroup): GroupPermissions {
  return {
    canRename: group.isOwner,
    canResetCode: group.isOwner,
    canDelete: group.isOwner,
    canLeave: !group.isOwner,
    canInvite: true,
    canModerate: group.isOwner,
  };
}

export function memberActions(
  group: IGroup,
  memberId: string,
  viewerId: string,
): MemberAction[] {
  if (!group.isOwner) return [];
  if (memberId === viewerId) return [];
  if (memberId === group.owner._id) return [];
  return ["transferOwner", "kick", "ban"];
}

export function canKickFromVoice(
  group: IGroup | undefined,
  identity: string,
  viewerId: string,
): boolean {
  if (!group?.isOwner) return false;
  if (identity === viewerId) return false;
  return identity !== group.owner._id;
}
