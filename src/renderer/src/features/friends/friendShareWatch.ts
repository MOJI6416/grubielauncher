import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { ActiveFriendShare } from "@/types/Share";
import { navigate } from "@renderer/navigation/navigate";
import { accountAtom, localFriendsAtom } from "@renderer/stores/atoms";
import { refreshActiveFriendShares } from "@renderer/utilities/friendShares";
import { playSound } from "@renderer/utilities/sounds";
import { joinFriendWorld } from "@renderer/features/launch/joinFriendWorld";
import { mutedFriendIds } from "./muteFriend";
import { pickNewShares } from "./shareSessions";

const api = window.api;

let knownSessions: Set<string> | null = null;

export function resetFriendShareWatch(): void {
  knownSessions = null;
}

export async function checkFriendShares(): Promise<void> {
  const store = getDefaultStore();
  const account = store.get(accountAtom);
  if (!account?.accessToken) return;

  const shares = await refreshActiveFriendShares();
  if (!shares) return;

  const previous = knownSessions;
  knownSessions = new Set(shares.map((share) => share.sessionId));

  const muted = mutedFriendIds(store.get(localFriendsAtom));

  for (const share of pickNewShares<ActiveFriendShare>(previous, shares)) {
    if (muted.has(share.hostUserId)) continue;

    const versionCode = share.versionShareCode;
    const message = i18n.t("friends.worldOpened", {
      nickname: share.hostNickname,
    });

    if (document.hasFocus()) playSound("notify");
    toast(message, {
      duration: 15000,
      action: versionCode
        ? {
            label: i18n.t("friends.joinFlow.playAction"),
            onClick: () => {
              void joinFriendWorld({
                versionCode,
                hostNickname: share.hostNickname,
                slug: share.slug,
              });
            },
          }
        : {
            label: i18n.t("friends.joinFlow.openFriends"),
            onClick: () => navigate({ name: "people" }),
          },
    });

    if (!document.hasFocus()) {
      void api.other
        .notify({ title: "Grubie Launcher", body: message })
        .catch(() => {});
    }
  }
}
