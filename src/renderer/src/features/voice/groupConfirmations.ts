import type { ConfirmationTone } from "@renderer/components/Modals/confirmationLayout";

export type GroupConfirmKind =
  | "delete"
  | "leave"
  | "resetCode"
  | "transfer"
  | "kick"
  | "ban";

export interface GroupConfirmCopy {
  titleKey: string;
  actionKey: string;
  lineKeys: string[];
  actionColor: ConfirmationTone;
  reversible?: boolean;
}

const COPY: Record<GroupConfirmKind, GroupConfirmCopy> = {
  delete: {
    titleKey: "groups.delete",
    actionKey: "groups.delete",
    lineKeys: ["groups.deleteConfirm", "groups.deleteLoss"],
    actionColor: "danger",
    reversible: false,
  },
  leave: {
    titleKey: "groups.leave",
    actionKey: "groups.leave",
    lineKeys: ["groups.leaveConfirm", "groups.leaveLoss"],
    actionColor: "danger",
  },
  resetCode: {
    titleKey: "groups.resetCode",
    actionKey: "groups.resetCode",
    lineKeys: ["groups.resetCodeConfirm", "groups.resetCodeLoss"],
    actionColor: "warning",
  },
  transfer: {
    titleKey: "groups.transferOwner",
    actionKey: "groups.transferOwner",
    lineKeys: ["groups.transferConfirm", "groups.transferLoss"],
    actionColor: "warning",
  },
  kick: {
    titleKey: "groups.kick",
    actionKey: "groups.kick",
    lineKeys: ["groups.kickConfirm", "groups.kickLoss"],
    actionColor: "danger",
  },
  ban: {
    titleKey: "groups.ban",
    actionKey: "groups.ban",
    lineKeys: ["groups.banConfirm", "groups.banLoss"],
    actionColor: "danger",
    reversible: true,
  },
};

export function groupConfirmCopy(kind: GroupConfirmKind): GroupConfirmCopy {
  return COPY[kind];
}

export function groupConfirmKinds(): GroupConfirmKind[] {
  return Object.keys(COPY) as GroupConfirmKind[];
}
