import { atom } from "jotai";
import { GameInvite } from "@/types/GameInvite";

export const incomingInviteAtom = atom<GameInvite | null>(null);

export interface InviteText {
  messageKey: string;
  params: Record<string, string>;
}

export function describeIncomingInvite(invite: GameInvite): InviteText {
  if (invite.target.type === "server") {
    return {
      messageKey: "friends.gameInviteServerBody",
      params: {
        nickname: invite.sender.nickname,
        version: invite.versionName,
        address: invite.target.address,
      },
    };
  }

  return {
    messageKey: "friends.gameInviteWorldBody",
    params: {
      nickname: invite.sender.nickname,
      version: invite.versionName,
    },
  };
}

export function describeInviteNotification(invite: GameInvite): InviteText {
  if (invite.target.type === "server") {
    return {
      messageKey: "friends.gameInviteNotificationServer",
      params: {
        nickname: invite.sender.nickname,
        version: invite.versionName,
        address: invite.target.address,
      },
    };
  }

  return {
    messageKey: "friends.gameInviteNotificationWorld",
    params: {
      nickname: invite.sender.nickname,
      version: invite.versionName,
    },
  };
}

const batchedRecipients = new Set<string>();

export function claimGameInviteResults(recipientIds: string[]) {
  for (const id of recipientIds) batchedRecipients.add(id);
}

export function releaseGameInviteResults(recipientIds: string[]) {
  for (const id of recipientIds) batchedRecipients.delete(id);
}

export function takeGameInviteResult(recipientId?: string): boolean {
  if (!recipientId) return false;
  return batchedRecipients.delete(recipientId);
}
