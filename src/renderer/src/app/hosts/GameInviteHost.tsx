import { useEffect } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { GameInvite } from "@/types/GameInvite";
import { GameInviteDialog } from "@renderer/features/friends/GameInviteDialog";
import {
  describeInviteNotification,
  incomingInviteAtom,
} from "@renderer/features/friends/gameInvite";
import { friendSocketAtom, localFriendsAtom } from "@renderer/stores/atoms";
import { useLatestRef } from "@renderer/utilities/useLatestRef";

const api = window.api;

export function GameInviteHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const friendSocket = useAtomValue(friendSocketAtom);
  const localFriends = useAtomValue(localFriendsAtom);
  const localFriendsRef = useLatestRef(localFriends);
  const [invite, setInvite] = useAtom(incomingInviteAtom);

  useEffect(() => {
    if (!friendSocket) return;

    const onGameInvite = async (incoming: GameInvite) => {
      const lf = localFriendsRef.current.find(
        (x) => x.id == incoming.sender._id,
      );
      if (lf?.isMuted) return;

      setInvite(incoming);

      const notification = describeInviteNotification(incoming);
      await api.other.notify(
        {
          title: tRef.current("friends.gameInviteNotificationTitle"),
          body: tRef.current(notification.messageKey, notification.params),
          icon: incoming.sender.image || "",
        },
        { type: "game_invite", inviteId: incoming.inviteId },
      );
    };

    friendSocket.on("gameInvite", onGameInvite);

    return () => {
      friendSocket.off("gameInvite", onGameInvite);
    };
  }, [friendSocket, localFriendsRef, setInvite, tRef]);

  if (!invite) return null;

  return <GameInviteDialog invite={invite} onClose={() => setInvite(null)} />;
}
