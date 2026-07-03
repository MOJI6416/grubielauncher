import { useEffect, useRef, useState } from "react";
import { useSetAtom } from "jotai";
import { DownloaderFailuresInfo, DownloaderInfo } from "@/types/Downloader";
import { VersionInstallProgress } from "@/types/InstallationProgress";
import { installActiveAtom } from "@renderer/stores/atoms";
import { InstallationProgress } from "./InstallationProgress";
import { InstallationMiniBar } from "./InstallationMiniBar";
import { DownloadFailuresModal } from "./DownloadFailuresModal";
import { playSound } from "@renderer/utilities/sounds";

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
  const setInstallActive = useSetAtom(installActiveAtom);

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
        setDownloadFailures(info);
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
          onClose={() => setDownloadFailures(null)}
        />
      )}
    </>
  );
}
