import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Socket } from "socket.io-client";
import type { GameInviteResult } from "@/types/GameInvite";
import {
  claimGameInviteResults,
  releaseGameInviteResults,
} from "@renderer/features/friends/gameInvite";

const BATCH_TIMEOUT_MS = 15000;

export interface GameInviteBatch {
  total: number;
  waiting: Set<string>;
  sent: number;
  codes: string[];
}

export function summariseGameInvites(batch: {
  total: number;
  sent: number;
  codes: string[];
}): { key: string; code?: string; params: Record<string, number> } {
  if (batch.sent === 0) {
    return { key: "none", code: batch.codes[0] || "unknown", params: {} };
  }
  if (batch.sent < batch.total) {
    return {
      key: "partial",
      code: batch.codes[0] || "unknown",
      params: { sent: batch.sent, total: batch.total },
    };
  }
  return { key: "all", params: { sent: batch.sent, total: batch.total } };
}

export function useGroupGameInvite(socket: Socket | null | undefined) {
  const { t } = useTranslation();
  const batchRef = useRef<GameInviteBatch | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const reason = useCallback(
    (code?: string) => {
      if (code === "timeout") return t("friends.operationErrors.timeout");
      if (code === "offline") return t("friends.operationErrors.offline");
      const key = `friends.inviteErrors.${code || "unknown"}`;
      const message = t(key);
      return message === key ? t("friends.inviteErrors.unknown") : message;
    },
    [t],
  );

  const finish = useCallback(() => {
    const batch = batchRef.current;
    batchRef.current = null;
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (!batch) return;

    releaseGameInviteResults([...batch.waiting]);
    const codes = [...batch.codes];
    for (let index = 0; index < batch.waiting.size; index += 1) {
      codes.push("timeout");
    }

    const summary = summariseGameInvites({
      total: batch.total,
      sent: batch.sent,
      codes,
    });

    if (summary.key === "all") {
      toast.success(t("groups.gameInvitesSent"));
      return;
    }
    if (summary.key === "partial") {
      toast.warning(t("groups.gameInvitesPartial", summary.params), {
        description: reason(summary.code),
      });
      return;
    }
    toast.warning(reason(summary.code));
  }, [reason, t]);

  useEffect(() => {
    if (!socket) return;

    const onResult = (result: GameInviteResult) => {
      const batch = batchRef.current;
      const recipientId = result?.recipientId;
      if (!batch || !recipientId || !batch.waiting.has(recipientId)) return;

      batch.waiting.delete(recipientId);
      if (result.ok) batch.sent += 1;
      else batch.codes.push(result.code || "unknown");

      if (batch.waiting.size === 0) finish();
    };

    const onDisconnect = () => {
      const batch = batchRef.current;
      if (!batch) return;
      for (let index = 0; index < batch.waiting.size; index += 1) {
        batch.codes.push("offline");
      }
      batch.waiting.clear();
      finish();
    };

    socket.on("gameInviteResult", onResult);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("gameInviteResult", onResult);
      socket.off("disconnect", onDisconnect);
    };
  }, [finish, socket]);

  useEffect(
    () => () => {
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
      const batch = batchRef.current;
      batchRef.current = null;
      if (batch) releaseGameInviteResults([...batch.waiting]);
    },
    [],
  );

  return useCallback(
    (recipientIds: string[], target: unknown) => {
      if (!socket || recipientIds.length === 0) return;
      if (!socket.connected) {
        toast.warning(t("friends.operationErrors.offline"));
        return;
      }
      if (batchRef.current) return;

      claimGameInviteResults(recipientIds);
      batchRef.current = {
        total: recipientIds.length,
        waiting: new Set(recipientIds),
        sent: 0,
        codes: [],
      };

      for (const recipientId of recipientIds) {
        socket.emit("gameInvite", { recipientId, target });
      }

      timerRef.current = window.setTimeout(finish, BATCH_TIMEOUT_MS);
    },
    [finish, socket, t],
  );
}
