import { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useTranslation } from "react-i18next";
import {
  VERSION_INSTALL_CANCELLED,
  VersionInstallProgress,
} from "@/types/InstallationProgress";
import { Loader } from "@/types/Loader";
import { resolveMirrorMode } from "@/shared/mirrorMode";
import { consolesMetaAtom, installActiveAtom } from "@renderer/stores/atoms";
import { playSound } from "@renderer/utilities/sounds";
import { ConnectivityModal } from "@renderer/components/ConnectivityModal";
import { installQueue } from "@renderer/features/install/installQueue";
import { mergeFailures } from "@renderer/features/install/failureGroups";
import {
  BatchTotal,
  EMPTY_BATCH_TOTAL,
  accumulateBatch,
  appendStageEvent,
  batchTotalValue,
  sealStageLog,
  smoothSpeed,
} from "@renderer/features/install/progressModel";
import {
  TaskRecord,
  patchLatestOutcome,
  pushTaskRecord,
  resolveOutcome,
  shouldCelebrate,
} from "@renderer/features/install/taskHistory";
import {
  connectivityCheckOpenAtom,
  downloaderInfoAtom,
  installCancellingAtom,
  installFailuresAtom,
  installFailuresSeenAtom,
  installHistoryAtom,
  installPauseStateAtom,
  installPausedAtom,
  installProgressAtom,
  installQueuedAtom,
  installSpeedAtom,
  installStageLogAtom,
  mirrorModeAtom,
  openTaskCenter,
} from "@renderer/features/install/installUi";

const api = window.api;

const MIRROR_POLL_MS = 6000;
const PAUSE_POLL_MS = 700;
const INTEGRITY_CLEAR_MS = 900;

interface TaskTrack {
  id: string;
  versionName: string;
  loaderName: Loader;
  operation: VersionInstallProgress["operation"];
  startedAt: number;
  bytes: BatchTotal;
  files: BatchTotal;
}

export function InstallHost() {
  const store = useStore();
  const { t } = useTranslation();
  const consoles = useAtomValue(consolesMetaAtom);
  const isConnectivityOpen = useAtomValue(connectivityCheckOpenAtom);
  const setConnectivityOpen = useSetAtom(connectivityCheckOpenAtom);
  const progress = useAtomValue(installProgressAtom);
  const isPaused = useAtomValue(installPausedAtom);
  const setInstallActive = useSetAtom(installActiveAtom);

  const trackRef = useRef<TaskTrack | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  const isGameRunning = consoles.some((meta) => meta.status === "running");
  const gameRunningRef = useRef(isGameRunning);
  gameRunningRef.current = isGameRunning;

  useEffect(() => {
    const finalize = (now: number) => {
      const track = trackRef.current;
      trackRef.current = null;

      const wasCancelled = store.get(installCancellingAtom);
      const failures = store.get(installFailuresAtom);
      const failedFiles =
        failures?.failedItems ?? store.get(downloaderInfoAtom)?.failedItems ?? 0;

      store.set(installProgressAtom, null);
      store.set(downloaderInfoAtom, null);
      store.set(installCancellingAtom, false);
      store.set(installPausedAtom, false);
      store.set(installPauseStateAtom, "off");
      store.set(installSpeedAtom, null);
      store.set(
        installStageLogAtom,
        sealStageLog(store.get(installStageLogAtom), now),
      );

      if (!track) return;

      const record: TaskRecord = {
        id: track.id,
        versionName: track.versionName,
        loaderName: track.loaderName,
        operation: track.operation,
        outcome: resolveOutcome({ cancelled: wasCancelled, failedFiles }),
        startedAt: track.startedAt,
        finishedAt: now,
        bytes: batchTotalValue(track.bytes),
        files: batchTotalValue(track.files),
        failedFiles,
        failures: failures ?? undefined,
      };

      store.set(
        installHistoryAtom,
        pushTaskRecord(store.get(installHistoryAtom), record),
      );

      if (record.outcome === "partial") {
        store.set(installFailuresSeenAtom, false);
        if (!gameRunningRef.current) {
          playSound("error");
          if (document.hasFocus()) openTaskCenter("failures");
        }
        if (!document.hasFocus()) {
          void api.other.notify({
            title: tRef.current("taskCenter.notifyPartialTitle"),
            body: tRef.current("taskCenter.notifyPartialBody", {
              name: record.versionName,
              count: record.failedFiles,
            }),
          });
        }
        return;
      }

      if (record.outcome !== "done") return;

      if (shouldCelebrate(record)) {
        if (!gameRunningRef.current) playSound("success");
        if (!document.hasFocus()) {
          void api.other.notify({
            title: tRef.current("taskCenter.notifyDoneTitle"),
            body: tRef.current("taskCenter.notifyDoneBody", {
              name: record.versionName,
            }),
          });
        }
      }
    };

    const clearPendingTimer = () => {
      if (clearTimerRef.current === null) return;
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    };

    const unsubscribeProgress = api.events.onVersionInstallProgress((info) => {
      const now = Date.now();
      clearPendingTimer();

      if (!info) {
        finalize(now);
        return;
      }

      const track = trackRef.current;
      const isDifferentTask =
        track &&
        (track.versionName !== info.versionName ||
          track.operation !== info.operation);

      if (isDifferentTask) finalize(now);

      if (!trackRef.current) {
        trackRef.current = {
          id: installQueue.nextId("install"),
          versionName: info.versionName,
          loaderName: info.loaderName,
          operation: info.operation,
          startedAt: now,
          bytes: EMPTY_BATCH_TOTAL,
          files: EMPTY_BATCH_TOTAL,
        };
        store.set(installStageLogAtom, []);
        store.set(installSpeedAtom, null);
        store.set(installFailuresAtom, null);
        store.set(installCancellingAtom, false);
        store.set(installPausedAtom, false);
        store.set(installPauseStateAtom, "off");
      }

      store.set(installProgressAtom, info);
      store.set(
        installStageLogAtom,
        appendStageEvent(store.get(installStageLogAtom), info.stage, now),
      );

      if (info.operation === "integrity" && info.stage === "done") {
        clearTimerRef.current = window.setTimeout(
          () => finalize(Date.now()),
          INTEGRITY_CLEAR_MS,
        );
      }
    });

    const unsubscribeDownloader = api.events.onDownloaderInfo((info) => {
      store.set(downloaderInfoAtom, info);

      const track = trackRef.current;
      if (info && track) {
        track.bytes = accumulateBatch(
          track.bytes,
          info.downloadedBytes,
          info.totalItems,
        );
        track.files = accumulateBatch(
          track.files,
          info.completedItems,
          info.totalItems,
        );
      }

      store.set(
        installSpeedAtom,
        info
          ? smoothSpeed(store.get(installSpeedAtom), info.downloadSpeed)
          : null,
      );
    });

    const unsubscribeFailures = api.events.onDownloaderFailures((info) => {
      if (!info) return;
      store.set(
        installFailuresAtom,
        mergeFailures(store.get(installFailuresAtom), info),
      );
      store.set(installFailuresSeenAtom, false);
    });

    const unsubscribeQueue = installQueue.subscribe((state) => {
      store.set(installQueuedAtom, state.pending);
    });

    const unsubscribeSettled = installQueue.subscribeSettled(({ error }) => {
      if (!error) return;

      const cancelled =
        error instanceof Error && error.message === VERSION_INSTALL_CANCELLED;

      store.set(
        installHistoryAtom,
        patchLatestOutcome(
          store.get(installHistoryAtom),
          cancelled ? "cancelled" : "failed",
          Date.now(),
        ),
      );
    });

    return () => {
      clearPendingTimer();
      unsubscribeProgress();
      unsubscribeDownloader();
      unsubscribeFailures();
      unsubscribeQueue();
      unsubscribeSettled();
    };
  }, [store]);

  useEffect(() => {
    setInstallActive(Boolean(progress));
  }, [progress, setInstallActive]);

  const isInstalling = Boolean(progress);

  useEffect(() => {
    if (!isInstalling || !isPaused) return;

    let cancelled = false;
    const poll = () => {
      void api.version
        .getPauseState()
        .then((state) => {
          if (!cancelled && state !== "off") {
            store.set(installPauseStateAtom, state);
          }
        })
        .catch(() => {});
    };

    poll();
    const timer = window.setInterval(poll, PAUSE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isInstalling, isPaused, store]);

  useEffect(() => {
    if (!isInstalling) return;

    let cancelled = false;
    const poll = () => {
      void api.mirror
        .getState()
        .then((state) => {
          if (!cancelled) store.set(mirrorModeAtom, resolveMirrorMode(state));
        })
        .catch(() => {});
    };

    poll();
    const timer = window.setInterval(poll, MIRROR_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isInstalling, store]);

  if (!isConnectivityOpen) return null;

  return <ConnectivityModal onClose={() => setConnectivityOpen(false)} />;
}
