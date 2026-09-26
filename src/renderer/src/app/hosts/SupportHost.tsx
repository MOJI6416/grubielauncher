import { Suspense, useEffect } from "react";
import { getDefaultStore, useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import { currentRouteAtom } from "@renderer/navigation/store";
import {
  openSupportReport,
  supportDialogAtom,
} from "@renderer/features/support/supportReport";
import { lazyWithPreload } from "@renderer/utilities/lazyPreload";
import { uiJournal } from "@renderer/utilities/journal";
import { useLatestRef } from "@renderer/utilities/useLatestRef";

const api = window.api;

const LazySupportReportDialog = lazyWithPreload(() =>
  import("@renderer/features/support/SupportReportDialog").then((module) => ({
    default: module.SupportReportDialog,
  })),
);

export function SupportHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const [request, setRequest] = useAtom(supportDialogAtom);

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
            payload.outLines > 0 ? "launchStall.quiet" : "launchStall.silent",
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
