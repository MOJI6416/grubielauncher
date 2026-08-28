import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Socket } from "socket.io-client";

const PING_TIMEOUT_MS = 15000;

export function operationErrorMessage(
  t: (key: string) => string,
  code: string | undefined,
): string {
  const key = `friends.operationErrors.${code || "unknown"}`;
  const message = t(key);
  return message === key ? t("friends.operationErrors.unknown") : message;
}

export function useVoicePing(socket: Socket | null | undefined) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<string[]>([]);
  const [pingedAt, setPingedAt] = useState<Record<string, number>>({});
  const timersRef = useRef(new Map<string, number>());

  const settle = useCallback((recipientId: string) => {
    const timer = timersRef.current.get(recipientId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(recipientId);
    }
    setPending((prev) => prev.filter((id) => id !== recipientId));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onResult = (result: { ok?: boolean; recipientId?: string }) => {
      const recipientId = result?.recipientId;
      if (!recipientId || !timersRef.current.has(recipientId)) return;

      settle(recipientId);
      if (result.ok === false) return;
      setPingedAt((prev) => ({ ...prev, [recipientId]: Date.now() }));
      toast.success(t("groups.voicePingSent"));
    };

    const onError = (error: {
      operation?: string;
      code?: string;
      recipientId?: string;
    }) => {
      if (error?.operation !== "groupVoicePing") return;

      const recipientId =
        error.recipientId && timersRef.current.has(error.recipientId)
          ? error.recipientId
          : [...timersRef.current.keys()][0];
      if (!recipientId) return;

      settle(recipientId);
      toast.warning(operationErrorMessage(t, error.code));
    };

    const onDisconnect = () => {
      const waiting = [...timersRef.current.keys()];
      if (waiting.length === 0) return;
      for (const recipientId of waiting) settle(recipientId);
      toast.warning(t("friends.operationErrors.offline"));
    };

    socket.on("groupVoicePingResult", onResult);
    socket.on("operationError", onError);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("groupVoicePingResult", onResult);
      socket.off("operationError", onError);
      socket.off("disconnect", onDisconnect);
    };
  }, [settle, socket, t]);

  const ping = useCallback(
    (recipientId: string, groupId: string) => {
      if (!socket || !recipientId || !groupId) return;
      if (!socket.connected) {
        toast.warning(t("friends.operationErrors.offline"));
        return;
      }
      if (timersRef.current.has(recipientId)) return;

      socket.emit("groupVoicePing", { recipientId, groupId });
      setPending((prev) => [...prev, recipientId]);
      timersRef.current.set(
        recipientId,
        window.setTimeout(() => {
          settle(recipientId);
          toast.warning(t("friends.operationErrors.timeout"));
        }, PING_TIMEOUT_MS),
      );
    },
    [settle, socket, t],
  );

  return { ping, pending, pingedAt };
}
