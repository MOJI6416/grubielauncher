import { getDefaultStore } from "jotai";
import {
  activeFriendSharesAtom,
  friendRequestsAtom,
  friendsAtom,
  groupInvitesAtom,
  groupsAtom,
  groupsLoadFailedAtom,
  localFriendsAtom,
  openGroupChatIdAtom,
  pendingFriendChatAtom,
  pendingFriendRequestAtom,
  selectedFriendAtom,
} from "@renderer/stores/atoms";
import { forgetChatDrafts } from "./chatDrafts";
import { resetFriendShareWatch } from "./friendShareWatch";
import { clearOutgoing } from "./outgoingSends";
import { incomingInviteAtom } from "./gameInvite";

export function resetFriendsState(): void {
  const store = getDefaultStore();

  store.set(friendsAtom, []);
  store.set(friendRequestsAtom, []);
  store.set(localFriendsAtom, []);
  store.set(activeFriendSharesAtom, []);
  store.set(groupsAtom, []);
  store.set(groupsLoadFailedAtom, false);
  store.set(groupInvitesAtom, []);
  store.set(selectedFriendAtom, undefined);
  store.set(openGroupChatIdAtom, null);
  store.set(incomingInviteAtom, null);
  store.set(pendingFriendChatAtom, null);
  store.set(pendingFriendRequestAtom, null);

  forgetChatDrafts();
  clearOutgoing();
  resetFriendShareWatch();
}
