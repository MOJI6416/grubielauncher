import type { GameInvite } from "@/types/GameInvite";
import { joinFriendWorld } from "@renderer/features/launch/joinFriendWorld";
import { countFeature } from "@renderer/features/usage/usage";

export async function acceptGameInvite(invite: GameInvite): Promise<void> {
  countFeature("share.acceptInvite");
  await joinFriendWorld({
    versionCode: invite.versionCode,
    hostNickname: invite.sender.nickname,
    hostUserId: invite.sender._id,
    slug: invite.target.type === "world" ? invite.target.slug : undefined,
    address: invite.target.type === "server" ? invite.target.address : undefined,
  });
}
