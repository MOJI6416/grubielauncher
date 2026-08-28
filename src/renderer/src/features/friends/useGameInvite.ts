import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Socket } from "socket.io-client";
import type { ShareState } from "@/types/Share";
import type { IUpdateStatus } from "@/types/IFriend";

const STARTING_PHASES = [
  "share_starting",
  "tunnel_connecting",
  "pending",
  "reconnecting",
];

const ANSWER_TIMEOUT_MS = 15000;

export interface InviteGuide {
  title: string;
  description: string;
  steps: string[];
  canOpenShare: boolean;
}

export interface GameInviteOptions {
  socket?: Socket;
  ownPresence: Required<IUpdateStatus>;
  shareState: ShareState;
  canManageShare: boolean;
}

export function useGameInvite({
  socket,
  ownPresence,
  shareState,
  canManageShare,
}: GameInviteOptions) {
  const { t } = useTranslation();
  const [inviteGuide, setInviteGuide] = useState<InviteGuide | null>(null);
  const [sentInvites, setSentInvites] = useState(0);

  useEffect(() => {
    if (!socket) return;

    const handleResult = () => setSentInvites(0);
    socket.on("gameInviteResult", handleResult);

    return () => {
      socket.off("gameInviteResult", handleResult);
    };
  }, [socket]);

  useEffect(() => {
    if (sentInvites === 0) return;

    const timer = window.setTimeout(() => {
      setSentInvites(0);
      toast.warning(t("friends.operationErrors.timeout"));
    }, ANSWER_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [sentInvites, t]);

  const showGuide = useCallback(
    (key: string, canOpenShare = false) => {
      const steps = t(`friends.inviteGuide.${key}Steps`, {
        returnObjects: true,
        defaultValue: [],
      });

      setInviteGuide({
        title: t(`friends.inviteGuide.${key}Title`),
        description: t(`friends.inviteGuide.${key}Description`),
        steps: Array.isArray(steps) ? (steps as string[]) : [],
        canOpenShare,
      });
    },
    [t],
  );

  const invite = useCallback(
    (recipientId: string) => {
      if (!socket) return;

      if (!socket.connected) {
        toast.warning(t("friends.operationErrors.offline"));
        return;
      }

      if (!ownPresence.versionName) {
        showGuide("noGame");
        return;
      }

      if (!ownPresence.versionCode) {
        showGuide("unpublished");
        return;
      }

      if (ownPresence.serverAddress) {
        socket.emit("gameInvite", {
          recipientId,
          target: { type: "server" },
        });
        setSentInvites((count) => count + 1);
        return;
      }

      if (
        canManageShare &&
        shareState.phase === "online" &&
        shareState.slug &&
        shareState.sessionId &&
        shareState.publicAddress
      ) {
        socket.emit("gameInvite", {
          recipientId,
          target: {
            type: "world",
            slug: shareState.slug,
            sessionId: shareState.sessionId,
            publicAddress: shareState.publicAddress,
            visibility: shareState.visibility,
          },
        });
        setSentInvites((count) => count + 1);
        return;
      }

      if (canManageShare && STARTING_PHASES.includes(shareState.phase)) {
        showGuide("shareStarting");
        return;
      }

      if (shareState.phase === "lan_ready" || shareState.candidate) {
        showGuide(canManageShare ? "worldReady" : "worldLan", canManageShare);
        return;
      }

      showGuide("worldLan");
    },
    [canManageShare, ownPresence, shareState, showGuide, socket, t],
  );

  const closeGuide = useCallback(() => setInviteGuide(null), []);

  return { inviteGuide, invite, closeGuide };
}
