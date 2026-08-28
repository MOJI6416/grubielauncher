import { useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { Check, Loader2, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { motionTransition } from "@/lib/motion";
import { getLoaderInfo } from "@renderer/components/Loaders";
import { Hint } from "@renderer/components/Hint";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import {
  cancelActiveInstall,
  toggleInstallPause,
} from "@renderer/features/install/installActions";
import {
  buildDownloadStats,
  buildStageRows,
  clampPercent,
  estimateEta,
  stagePlan,
  stageElapsed,
  stripGroupPrefix,
  type StageRow,
} from "@renderer/features/install/progressModel";
import { usePacedStageLog } from "@renderer/features/install/usePacedStageLog";
import { useInstallFormatters } from "@renderer/features/install/useInstallFormatters";
import {
  downloaderInfoAtom,
  installCancellingAtom,
  installPauseStateAtom,
  installPausedAtom,
  installProgressAtom,
  installSpeedAtom,
  installStageLogAtom,
} from "@renderer/features/install/installUi";
import type { Loader } from "@/types/Loader";

const STAGE_LOG_VISIBLE = 6;
const STAGE_ROW_HEIGHT = 24;

function StageMark({ state }: { state: StageRow["state"] }) {
  if (state === "running") {
    return <Loader2 className="size-3 shrink-0 animate-spin text-primary" />;
  }

  if (state === "done") {
    return <Check className="size-3 shrink-0 text-success" />;
  }

  return (
    <span className="flex size-3 shrink-0 items-center justify-center">
      <span className="size-1.5 rounded-full bg-muted-foreground/35" />
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 px-2.5 py-1.5">
      <p className="truncate text-[0.65rem] text-faint">{label}</p>
      <p className="truncate font-mono text-xs tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

export function InstallView({
  name,
  loader,
  onCancel,
}: {
  name: string;
  loader: Loader;
  onCancel: () => void;
}) {
  const progress = useAtomValue(installProgressAtom);
  const downloader = useAtomValue(downloaderInfoAtom);
  const speed = useAtomValue(installSpeedAtom);
  const isPaused = useAtomValue(installPausedAtom);
  const pauseState = useAtomValue(installPauseStateAtom);
  const isCancelling = useAtomValue(installCancellingAtom);
  const stageLog = useAtomValue(installStageLogAtom);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [isStopping, setStopping] = useState(false);
  const stages = usePacedStageLog(stageLog);
  const transition = motionTransition(useReducedMotion());
  const format = useInstallFormatters();
  const { t } = useTranslation();

  const isStopRequested = isCancelling || isStopping;
  const isQueuedBehind = !!progress && progress.versionName !== name;
  const isPausedView = isPaused && !isQueuedBehind;
  const info = getLoaderInfo(loader);
  const percent = progress ? clampPercent(progress.progressPercent) : 0;
  const isIndeterminate =
    !progress || progress.isIndeterminate === true || isQueuedBehind;
  const stats = isQueuedBehind ? null : buildDownloadStats(downloader);
  const eta = isQueuedBehind ? null : estimateEta(downloader, speed);
  const now = Date.now();

  const details =
    isQueuedBehind || !progress
      ? ""
      : progress.detailsKey
        ? t(progress.detailsKey, {
            defaultValue: progress.details || "",
            ...(progress.detailsParams || {}),
          })
        : progress.details;

  const fileName = isQueuedBehind
    ? undefined
    : stripGroupPrefix(downloader?.currentFileName);
  const groupLabel =
    !isQueuedBehind && downloader?.currentGroup
      ? t(`downloadProgress.groups.${downloader.currentGroup}`, {
          defaultValue: downloader.currentGroup,
        })
      : "";

  const currentStage = stages[stages.length - 1]?.stage ?? progress?.stage;
  const rows = buildStageRows(
    isQueuedBehind ? [] : stages,
    stagePlan("install"),
  ).slice(-STAGE_LOG_VISIBLE);

  return (
    <LazyMotion features={domAnimation}>
      <div className="m-auto flex w-full max-w-2xl flex-col gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("size-2.5 shrink-0 rounded-full", info.dot)} />
          <Hint content={name} variant="text" truncatedOnly>
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
              {name}
            </span>
          </Hint>
          <span className="shrink-0 text-[0.7rem] text-faint">
            {t("installationProgress.overallLabel")}
          </span>
          <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
            {isIndeterminate ? "…" : `${percent}%`}
          </span>
        </div>

        <Progress
          value={isIndeterminate ? 100 : percent}
          max={100}
          className={cn(
            "h-2",
            isIndeterminate && !isPausedView && "progress-sweep",
            isPausedView && "[&_[data-slot=progress-indicator]]:animate-pulse",
          )}
        />

        <div className="grid gap-2 rounded-xl border border-border bg-surface-1 p-2.5">
          <div className="flex h-5 min-w-0 items-center gap-2">
            {isPausedView ? (
              <Pause className="size-3.5 shrink-0 text-warning" />
            ) : (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {isQueuedBehind
                ? t("newInstance.queuedBehind", {
                    name: progress.versionName,
                  })
                : isPausedView
                  ? pauseState === "pending"
                    ? t("installationProgress.pausing")
                    : t("installationProgress.paused")
                  : t(
                      `installationProgress.stages.${currentStage ?? "preparing"}`,
                    )}
            </span>
            {eta !== null && eta > 0 && !isPausedView && (
              <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                {t("taskCenter.remaining")} {format.seconds(eta)}
              </span>
            )}
          </div>

          <p className="flex h-4 min-w-0 items-center gap-1.5">
            {fileName && (
              <span className="shrink-0 text-[0.65rem] tracking-[0.06em] text-faint uppercase">
                {t("installationProgress.nowDownloading")}
              </span>
            )}
            {groupLabel && (
              <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                {groupLabel}
              </span>
            )}
            <Hint content={fileName || details} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-faint">
                {fileName || details || ""}
              </span>
            </Hint>
          </p>

          <div className="grid grid-cols-3 gap-2">
            <Stat
              label={t("taskCenter.files")}
              value={stats ? `${stats.filesDone}/${stats.filesTotal}` : "—"}
            />
            <Stat
              label={t("taskCenter.size")}
              value={
                !stats
                  ? "—"
                  : stats.bytesTotal > 0
                    ? format.byteRange(stats.bytesDone, stats.bytesTotal)
                    : format.bytes(stats.bytesDone)
              }
            />
            <Stat
              label={t("taskCenter.speed")}
              value={
                !isQueuedBehind && !isPaused && speed && speed > 0
                  ? format.speed(speed)
                  : "—"
              }
            />
          </div>
        </div>

        <ol
          style={{ height: STAGE_LOG_VISIBLE * STAGE_ROW_HEIGHT + 16 }}
          className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface-1 p-2"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row) => (
              <m.li
                key={row.key}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={transition}
                style={{ height: STAGE_ROW_HEIGHT }}
                className="flex shrink-0 items-center gap-2 px-1 text-xs"
              >
                <StageMark state={row.state} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    row.state === "running"
                      ? "text-foreground"
                      : row.state === "done"
                        ? "text-muted-foreground"
                        : "text-faint",
                  )}
                >
                  {t(`installationProgress.stages.${row.stage}`)}
                </span>
                <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-faint">
                  {row.event
                    ? format.elapsed(stageElapsed(row.event, now))
                    : ""}
                </span>
              </m.li>
            ))}
          </AnimatePresence>
        </ol>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isStopRequested || !progress || isQueuedBehind}
            onClick={() => void toggleInstallPause()}
          >
            {isPausedView ? <Play /> : <Pause />}
            {isPausedView
              ? t("installationProgress.resume")
              : t("installationProgress.pause")}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            disabled={isStopRequested}
            onClick={() => setConfirmOpen(true)}
          >
            {isStopRequested ? <Loader2 className="animate-spin" /> : <X />}
            {isStopRequested
              ? t("newInstance.cancellingInstall")
              : t("newInstance.cancelInstall")}
          </Button>
        </div>

        {isConfirmOpen && (
          <Confirmation
            title={t("newInstance.cancelConfirmTitle")}
            reversible={false}
            content={[{ text: t("newInstance.cancelConfirmBody") }]}
            buttons={[
              {
                text: t("newInstance.cancelConfirmKeep"),
                color: "secondary",
                onClick: () => setConfirmOpen(false),
              },
              {
                text: t("newInstance.cancelInstall"),
                color: "danger",
                onClick: async () => {
                  setConfirmOpen(false);
                  setStopping(true);
                  onCancel();
                  if (!isQueuedBehind) await cancelActiveInstall();
                },
              },
            ]}
            onClose={() => setConfirmOpen(false)}
          />
        )}
      </div>
    </LazyMotion>
  );
}
