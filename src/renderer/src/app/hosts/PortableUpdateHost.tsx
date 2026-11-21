import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { useLauncherRuntime } from "@renderer/app/launcherRuntime";
import {
  PORTABLE_CHECK_DELAY_MS,
  PORTABLE_CHECK_INTERVAL_MS,
  pickPortableUpdate,
  portableDownloadUrl,
} from "@renderer/features/appUpdate/portableUpdate";
import { countFeature } from "@renderer/features/usage/usage";
import { pathsAtom } from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import {
  readLauncherState,
  writeLauncherState,
} from "@renderer/utilities/launcherState";
import { useLatestRef } from "@renderer/utilities/useLatestRef";

const api = window.api;

const TOAST_ID = "portable-update";

async function rememberClosed(launcherPath: string, version: string) {
  const state = await readLauncherState(launcherPath);
  await writeLauncherState(launcherPath, {
    ...(state ?? {}),
    portableUpdate: { dismissedVersion: version },
  });
}

export function PortableUpdateHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const portable = Boolean(useLauncherRuntime()?.portableRoot);
  const launcherPath = useAtomValue(pathsAtom).launcher;

  useEffect(() => {
    if (!portable || !launcherPath) return;

    let stopped = false;
    let shown: string | null = null;

    const check = async () => {
      const locale = i18n.resolvedLanguage || i18n.language || "en";
      const [current, page, state] = await Promise.all([
        api.other.getVersion(),
        api.backend.getLauncherReleases(locale, 1),
        readLauncherState(launcherPath),
      ]);
      const version = pickPortableUpdate(
        current,
        page?.items[0]?.version,
        state?.portableUpdate?.dismissedVersion,
      );
      if (stopped || !version || version === shown) return;
      shown = version;

      const remember = () => {
        void rememberClosed(launcherPath, version).catch(ignoreFailure);
      };

      toast.info(tRef.current("appUpdate.portable.title", { version }), {
        id: TOAST_ID,
        duration: Infinity,
        description: tRef.current("appUpdate.portable.description"),
        action: {
          label: tRef.current("appUpdate.portable.download"),
          onClick: () => {
            countFeature("app.portableDownload");
            remember();
            void api.shell
              .openExternal(portableDownloadUrl(locale))
              .catch((error) =>
                showFailureToast(
                  tRef.current("settings.about.openLinkFailed"),
                  error,
                  { channels: ["shell:openExternal"] },
                ),
              );
          },
        },
        cancel: {
          label: tRef.current("appUpdate.portable.hide"),
          onClick: remember,
        },
        onDismiss: remember,
      });
    };

    const run = () => {
      void check().catch(ignoreFailure);
    };
    const first = window.setTimeout(run, PORTABLE_CHECK_DELAY_MS);
    const timer = window.setInterval(run, PORTABLE_CHECK_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [portable, launcherPath, tRef]);

  return null;
}
