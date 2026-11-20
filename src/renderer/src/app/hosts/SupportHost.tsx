import { Suspense, useEffect } from "react";
import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { SupportReply } from "@/types/Journal";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import { navigate } from "@renderer/navigation/navigate";
import { currentRouteAtom } from "@renderer/navigation/store";
import {
  markSupportReplySeen,
  mergeSupportReply,
  openSupportReport,
  supportDialogAtom,
  supportRepliesAtom,
  toLiveSupportReply,
} from "@renderer/features/support/supportReport";
import {
  accountAtom,
  authDataAtom,
  friendSocketAtom,
} from "@renderer/stores/atoms";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { lazyWithPreload } from "@renderer/utilities/lazyPreload";
import { uiJournal } from "@renderer/utilities/journal";
import { useLatestRef } from "@renderer/utilities/useLatestRef";

const api = window.api;

const REPLY_PREVIEW = 240;

const LazySupportReportDialog = lazyWithPreload(() =>
  import("@renderer/features/support/SupportReportDialog").then((module) => ({
    default: module.SupportReportDialog,
  })),
);

export function SupportHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const [request, setRequest] = useAtom(supportDialogAtom);
  const setReplies = useSetAtom(supportRepliesAtom);
  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const friendSocket = useAtomValue(friendSocketAtom);
  const token =
    account && account.type !== "plain" && authData
      ? account.accessToken || null
      : null;

  useEffect(() => {
    if (!token) {
      setReplies(null);
      return;
    }

    let cancelled = false;

    const announce = (reply: SupportReply, live: boolean) => {
      const title = tRef.current("supportReply.title", {
        code: reply.code.replace(/-/g, "\u2011"),
      });
      const preview =
        reply.reply.length > REPLY_PREVIEW
          ? `${reply.reply.slice(0, REPLY_PREVIEW).trimEnd()}…`
          : reply.reply;

      uiJournal.info("support", "support reply shown", {
        code: reply.code,
        live,
      });
      toast(title, {
        id: `support-reply-${reply.code}`,
        description: preview,
        duration: 30000,
        action: {
          label: tRef.current("supportReply.open"),
          onClick: () => navigate({ name: "settings", section: "support" }),
        },
      });
      if (live && !document.hasFocus()) {
        void api.other
          .notify({ title, body: preview })
          .catch(ignoreFailure);
      }

      void api.support
        .replySeen(token, reply.code)
        .then((marked) => {
          if (marked && !cancelled) {
            setReplies((current) => markSupportReplySeen(current, reply.code));
          }
        })
        .catch(ignoreFailure);
    };

    void api.support
      .replies(token)
      .then((replies) => {
        if (cancelled) return;
        setReplies(replies);
        for (const reply of replies ?? []) {
          if (!reply.seen) announce(reply, false);
        }
      })
      .catch(ignoreFailure);

    const onReply = (payload: unknown) => {
      const reply = toLiveSupportReply(payload);
      if (!reply) return;
      setReplies((current) => mergeSupportReply(current, reply));
      announce(reply, true);
    };

    friendSocket?.on("supportReply", onReply);
    return () => {
      cancelled = true;
      friendSocket?.off("supportReply", onReply);
    };
  }, [token, friendSocket, setReplies, tRef]);

  useEffect(() => {
    return api.events.onLaunchStalled((payload) => {
      uiJournal.warn("launch", "launch stall shown to the player", {
        ...payload,
      });
      toast.warning(
        tRef.current("launchStall.title", { version: payload.versionName }),
        {
          id: `launch-stall-${payload.versionName}-${payload.instance}`,
          description: tRef.current(
            payload.hint === "auth"
              ? "launchStall.auth"
              : payload.outLines > 0
                ? "launchStall.quiet"
                : "launchStall.silent",
          ),
          duration: 30000,
          action: {
            label: tRef.current("launchStall.report"),
            onClick: () => openSupportReport("stall", payload.versionName),
          },
        },
      );
    });
  }, [tRef]);

  useEffect(() => {
    const store = getDefaultStore();
    let last = "";

    const logRoute = () => {
      const route = store.get(currentRouteAtom);
      const serialized = route ? JSON.stringify(route) : "";
      if (serialized === last) return;
      last = serialized;
      uiJournal.info("nav", route?.name ?? "unknown", route ? { ...route } : undefined);
    };

    logRoute();
    return store.sub(currentRouteAtom, logRoute);
  }, []);

  if (!request) return null;

  return (
    <Suspense fallback={<LazyDialogFallback variant="form" />}>
      <LazySupportReportDialog
        request={request}
        onClose={() => setRequest(null)}
      />
    </Suspense>
  );
}
