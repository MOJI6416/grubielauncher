import { useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { DownloaderFailuresInfo, DownloaderInfo } from "@/types/Downloader";
import { VersionInstallProgress } from "@/types/InstallationProgress";
import {
  accountAtom,
  installActiveAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { InstallationProgress } from "./InstallationProgress";
import { InstallationMiniBar } from "./InstallationMiniBar";
import { DownloadFailuresModal } from "./DownloadFailuresModal";
import { playSound } from "@renderer/utilities/sounds";
import { showFailureToast } from "@renderer/utilities/failures";

const api = window.api;

export function InstallationCenter() {
  const [downloader, setDownloader] = useState<DownloaderInfo | null>(null);
  const [downloadFailures, setDownloadFailures] =
    useState<DownloaderFailuresInfo | null>(null);
  const [installProgress, setInstallProgress] =
    useState<VersionInstallProgress | null>(null);
  const [isCancellingInstall, setIsCancellingInstall] = useState(false);
  const [isInstallMinimized, setIsInstallMinimized] = useState(false);
  const [isInstallPaused, setIsInstallPaused] = useState(false);
  const [failuresVersionName, setFailuresVersionName] = useState<string | null>(
    null,
  );
  const [isRetrying, setIsRetrying] = useState(false);
  const setInstallActive = useSetAtom(installActiveAtom);
  const versions = useAtomValue(versionsAtom);
  const account = useAtomValue(accountAtom);
  const settings = useAtomValue(settingsAtom);
  const { t } = useTranslation();
  const failuresSeqRef = useRef(0);

  const isCancellingInstallRef = useRef(isCancellingInstall);
  isCancellingInstallRef.current = isCancellingInstall;
  const isInstallPausedRef = useRef(isInstallPaused);
  isInstallPausedRef.current = isInstallPaused;
  const installTrackRef = useRef<{
    startedAt: number;
    doneSeen: boolean;
    percent: number;
  } | null>(null);

  useEffect(() => {
    const unsubscribeDownloaderInfo = api.events.onDownloaderInfo((info) => {
      setDownloader(info);
    });

    const unsubscribeDownloaderFailures = api.events.onDownloaderFailures(
      (info) => {
        failuresSeqRef.current++;
        setDownloadFailures(info);
        setFailuresVersionName(info?.versionName ?? null);
      },
    );

    const unsubscribeVersionInstallProgress =
      api.events.onVersionInstallProgress((info) => {
        if (info?.stage === "preparing") {
          setIsCancellingInstall(false);
          installTrackRef.current = {
            startedAt: Date.now(),
            doneSeen: false,
            percent: 0,
          };
        }
        if (info && installTrackRef.current) {
          installTrackRef.current.percent = info.progressPercent;
          if (info.stage === "done") installTrackRef.current.doneSeen = true;
        }
        if (!info) {
          setIsCancellingInstall(false);
          const track = installTrackRef.current;
          installTrackRef.current = null;
          if (
            track &&
            track.doneSeen &&
            track.percent >= 90 &&
            !isCancellingInstallRef.current &&
            Date.now() - track.startedAt > 15000
          ) {
            playSound("success");
          }
        }
        setInstallProgress(info);
      });

    return () => {
      unsubscribeDownloaderInfo();
      unsubscribeDownloaderFailures();
      unsubscribeVersionInstallProgress();
    };
  }, []);

  useEffect(() => {
    if (
      installProgress?.operation !== "integrity" ||
      installProgress.stage !== "done"
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setInstallProgress((current) =>
        current === installProgress ? null : current,
      );
      setDownloader(null);
      setIsCancellingInstall(false);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [installProgress]);

  useEffect(() => {
    setInstallActive(Boolean(installProgress));
    if (!installProgress) {
      setIsInstallMinimized(false);
      setIsInstallPaused(false);
    }
  }, [installProgress, setInstallActive]);

  const cancelVersionInstall = async () => {
    setIsCancellingInstall(true);
    try {
      await Promise.all([
        api.version.cancelInstall(),
        api.mods.cancelInstall(),
      ]);
    } catch (error) {
      console.error(error);
      setIsCancellingInstall(false);
    }
  };

  const retryVersion =
    versions.find((item) => item.version.name === failuresVersionName) ?? null;

  const retryFailedDownloads = async () => {
    if (!retryVersion || !account) return;

    const seq = failuresSeqRef.current;
    setIsRetrying(true);
    try {
      await retryVersion.install(account, settings);
      if (failuresSeqRef.current === seq) setDownloadFailures(null);
    } catch (error) {
      showFailureToast(t("versions.installError"), error);
    } finally {
      setIsRetrying(false);
    }
  };

  const toggleInstallPause = async () => {
    const next = !isInstallPausedRef.current;
    setIsInstallPaused(next);
    try {
      if (next) await api.version.pauseInstall();
      else await api.version.resumeInstall();
    } catch (error) {
      console.error(error);
      setIsInstallPaused(!next);
    }
  };

  return (
    <>
      {installProgress ? (
        isInstallMinimized ? (
          <InstallationMiniBar
            info={installProgress}
            downloadInfo={downloader}
            isPaused={isInstallPaused}
            isCancelling={isCancellingInstall}
            onExpand={() => setIsInstallMinimized(false)}
            onTogglePause={toggleInstallPause}
            onCancel={cancelVersionInstall}
          />
        ) : (
          <InstallationProgress
            info={installProgress}
            downloadInfo={downloader}
            onCancel={cancelVersionInstall}
            isCancelling={isCancellingInstall}
            onMinimize={() => setIsInstallMinimized(true)}
            isPaused={isInstallPaused}
            onTogglePause={toggleInstallPause}
          />
        )
      ) : null}

      {downloadFailures && (
        <DownloadFailuresModal
          info={downloadFailures}
          isRetrying={isRetrying}
          onRetry={retryVersion && account ? retryFailedDownloads : undefined}
          onClose={() => setDownloadFailures(null)}
        />
      )}
    </>
  );
}
