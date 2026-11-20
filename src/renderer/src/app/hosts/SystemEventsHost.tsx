import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { navigate } from "@renderer/navigation/navigate";
import {
  isShareModalOpenAtom,
  pendingFriendChatAtom,
  selectedFriendAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import {
  isFailureHandled,
  pushIpcFailure,
  showFailureToast,
} from "@renderer/utilities/failures";
import { playSound } from "@renderer/utilities/sounds";
import { describeUpdateError } from "@renderer/features/appUpdate/updateError";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import { unexpectedQuarantine } from "@renderer/features/mods/expectedQuarantine";

const api = window.api;

const IPC_NOTICE_GRACE_MS = 700;

function describe(value: unknown): string {
  if (value instanceof Error) return value.message;
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function SystemEventsHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const devMode = useAtomValue(settingsAtom).devMode;
  const setSelectedFriend = useSetAtom(selectedFriendAtom);
  const setPendingFriendChat = useSetAtom(pendingFriendChatAtom);
  const setShareModalOpen = useSetAtom(isShareModalOpenAtom);

  useEffect(() => {
    if (!devMode) return;

    const onError = (event: ErrorEvent) => {
      toast.error(`[devMode] ${event.message}`, { duration: 12000 });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      toast.error(`[devMode] ${describe(event.reason).slice(0, 300)}`, {
        duration: 12000,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [devMode]);

  useEffect(() => {
    return api.other.onNotificationClick((action) => {
      if (action.type === "game_invite") {
        void api.other.restoreWindow();
        return;
      }

      if (action.type === "share_open") {
        setShareModalOpen(true);
        return;
      }

      if (action.type !== "friend_message") return;

      navigate({ name: "people" });
      setSelectedFriend(action.friendId);
      setPendingFriendChat(action.friendId);
      void api.other.restoreWindow();
    });
  }, [setPendingFriendChat, setSelectedFriend, setShareModalOpen]);

  useEffect(() => {
    const unsubscribeUpdateFailed = api.events.onUpdateFailed((payload) => {
      window.setTimeout(() => {
        playSound("error");
        if (payload?.reason === "loop") {
          toast.warning(tRef.current("app.updateLoopTitle"), {
            id: "update-loop",
            duration: 20_000,
            description: tRef.current("app.updateLoopHint", {
              version: payload.version ?? "",
              path: payload.path ?? "",
            }),
          });
          return;
        }
        if (payload?.reason === "signature") {
          toast.warning(tRef.current("app.updateSignatureTitle"), {
            id: "update-signature",
            duration: 20_000,
            description: tRef.current("app.updateSignatureHint", {
              version: payload.version ?? "",
            }),
          });
          return;
        }
        showFailureToast(tRef.current("app.updateFailed"), payload?.message, {
          fallbackDescription: describeUpdateError(
            payload?.message,
            tRef.current,
          ),
        });
      }, 0);
    });

    const pendingNotices = new Set<number>();

    const unsubscribeIpcError = api.events.onIpcError((payload) => {
      const entry = payload?.failure ? pushIpcFailure(payload.failure) : null;
      if (!payload?.notify) return;

      const timer = window.setTimeout(() => {
        pendingNotices.delete(timer);
        if (isFailureHandled(entry)) return;

        playSound("error");
        showFailureToast(tRef.current("ipcError.fileOperation"), undefined, {
          channels: payload.channel ? [payload.channel] : undefined,
          fallbackDescription: payload?.message,
        });
      }, IPC_NOTICE_GRACE_MS);

      pendingNotices.add(timer);
    });

    const unsubscribeServerSyncNotice = api.events.onServerSyncNotice(
      (notice) => {
        if (!notice) return;

        const entries = (notice.entries ?? []).join(", ");

        if (notice.level === "info") {
          toast.info(tRef.current("serverManager.syncAfterRestart"), {
            description: entries || undefined,
          });
          return;
        }

        playSound("error");
        toast.error(tRef.current("serverManager.syncFailed"), {
          description: [entries, notice.reason].filter(Boolean).join(" — "),
        });
      },
    );

    const unsubscribeModsQuarantined = api.events.onModsQuarantined(
      (notice) => {
        const entries = unexpectedQuarantine(
          notice?.versionName,
          notice?.entries ?? [],
        );
        if (entries.length === 0) return;

        toast.info(
          tRef.current("modManager.quarantinedTitle", {
            count: entries.length,
          }),
          {
            description: [
              entries.slice(0, 5).join(", "),
              tRef.current("modManager.quarantinedHint"),
            ].join(" — "),
          },
        );
      },
    );

    return () => {
      unsubscribeUpdateFailed();
      unsubscribeIpcError();
      pendingNotices.forEach((timer) => window.clearTimeout(timer));
      pendingNotices.clear();
      unsubscribeServerSyncNotice();
      unsubscribeModsQuarantined();
    };
  }, [tRef]);

  return null;
}
