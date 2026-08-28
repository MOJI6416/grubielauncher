import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import {
  AlertTriangle,
  Ban,
  Check,
  CircleSlash,
  Clock,
  Globe,
  HardDriveDownload,
  Loader2,
  Pause,
  Play,
  Wifi,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Progress } from "@/components/ui/progress";
import { motionTransition } from "@/lib/motion";
import { isMirrorNoteworthy } from "@/shared/mirrorMode";
import { versionsAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { instanceKey } from "@renderer/features/instances/selectors";
import { getLoaderInfo } from "@renderer/components/Loaders";
import { Hint } from "@renderer/components/Hint";
import { FailuresView } from "./FailuresView";
import {
  cancelActiveInstall,
  cancelQueuedInstall,
  toggleInstallPause,
} from "./installActions";
import {
  buildDownloadStats,
  buildStageRows,
  clampPercent,
  estimateEta,
  stagePlan,
  stageElapsed,
  stripGroupPrefix,
} from "./progressModel";
import { TaskOutcome, TaskRecord, taskDuration } from "./taskHistory";
import { usePacedStageLog } from "./usePacedStageLog";
import { useInstallFormatters } from "./useInstallFormatters";
import {
  closeTaskCenter,
  downloaderInfoAtom,
  installCancellingAtom,
  installFailuresAtom,
  installHistoryAtom,
  installPauseStateAtom,
  installPausedAtom,
  installProgressAtom,
  installQueuedAtom,
  installSpeedAtom,
  installStageLogAtom,
  mirrorModeAtom,
  openConnectivityCheck,
  taskCenterViewAtom,
} from "./installUi";

const STAGE_LOG_VISIBLE = 5;
const STAGE_ROW_HEIGHT = 28;

const OUTCOME_TONE: Record<TaskOutcome, string> = {
  done: "text-success",
  partial: "text-warning",
  cancelled: "text-faint",
  failed: "text-destructive",
};

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-3.5 pb-1.5 text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
      {children}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 px-2 py-1.5">
      <p className="truncate text-[10px] text-faint">{label}</p>
      <p className="truncate font-mono text-xs tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function MirrorChip() {
  const mode = useAtomValue(mirrorModeAtom);
  const { t } = useTranslation();

  if (!mode || !isMirrorNoteworthy(mode)) return null;

  return (
    <Hint content={t(`mirror.modes.${mode}.hint`)}>
      <span
        className={`flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
          mode === "mirror-cooldown"
            ? "border-warning/40 text-warning"
            : "border-border text-muted-foreground"
        }`}
      >
        <Globe className="size-3" />
        {t(`mirror.modes.${mode}.label`)}
      </span>
    </Hint>
  );
}

function ActiveTask() {
  const progress = useAtomValue(installProgressAtom);
  const downloader = useAtomValue(downloaderInfoAtom);
  const speed = useAtomValue(installSpeedAtom);
  const isPaused = useAtomValue(installPausedAtom);
  const pauseState = useAtomValue(installPauseStateAtom);
  const isCancelling = useAtomValue(installCancellingAtom);
  const stages = usePacedStageLog(useAtomValue(installStageLogAtom));
  const format = useInstallFormatters();
  const { t } = useTranslation();

  if (!progress) return null;

  const percent = clampPercent(progress.progressPercent);
  const stats = buildDownloadStats(downloader);
  const eta = estimateEta(downloader, speed);
  const loader = getLoaderInfo(progress.loaderName);
  const currentStage = stages[stages.length - 1]?.stage ?? progress.stage;
  const isDone = progress.stage === "done";

  const details = progress.detailsKey
    ? t(progress.detailsKey, {
        defaultValue: progress.details || "",
        ...(progress.detailsParams || {}),
      })
    : progress.details;

  const sub = progress.subProgress;
  const subTitle = sub
    ? t(sub.titleKey || `installationProgress.subProgress.${sub.kind}.title`)
    : "";

  const fileName = stripGroupPrefix(downloader?.currentFileName);
  const groupLabel = downloader?.currentGroup
    ? t(`downloadProgress.groups.${downloader.currentGroup}`, {
        defaultValue: downloader.currentGroup,
      })
    : "";

  return (
    <section className="shrink-0 border-b border-border px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${loader.dot}`} />
        <Hint content={progress.versionName} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {progress.versionName}
          </span>
        </Hint>
        {progress.operation !== "install" && (
          <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {progress.operation === "integrity"
              ? t("installationProgress.integrityTitle")
              : t("installationProgress.serverTitle")}
          </span>
        )}
        <span className="shrink-0 text-[10px] text-faint">
          {t("installationProgress.overallLabel")}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {progress.isIndeterminate ? "…" : `${percent}%`}
        </span>
      </div>

      <Progress
        value={progress.isIndeterminate ? 100 : percent}
        max={100}
        className={`mt-2.5 h-1.5 ${
          isPaused
            ? "[&_[data-slot=progress-indicator]]:animate-pulse"
            : progress.isIndeterminate
              ? "progress-sweep"
              : ""
        }`}
      />

      <div className="mt-2 flex h-5 min-w-0 items-center gap-2">
        {isDone ? (
          <Check className="size-3.5 shrink-0 text-success" />
        ) : isPaused ? (
          <Pause className="size-3.5 shrink-0 text-warning" />
        ) : (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {isPaused
            ? pauseState === "pending"
              ? t("installationProgress.pausing")
              : t("installationProgress.paused")
            : t(`installationProgress.stages.${currentStage}`)}
        </span>
        {eta !== null && eta > 0 && !isPaused && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
            {t("taskCenter.remaining")} {format.seconds(eta)}
          </span>
        )}
      </div>

      <p className="mt-1 flex h-4 min-w-0 items-center gap-1.5">
        {fileName && groupLabel && (
          <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {groupLabel}
          </span>
        )}
        <Hint content={fileName || details} variant="text" truncatedOnly>
          <span
            className={`min-w-0 flex-1 truncate text-[11px] text-faint ${fileName ? "font-mono" : ""}`}
          >
            {fileName || details || ""}
          </span>
        </Hint>
      </p>

      <Collapse show={!!sub}>
        {sub && (
          <div className="mt-2.5 rounded-lg bg-surface-2 px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {subTitle}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
                {clampPercent(sub.progressPercent)}%
              </span>
            </div>
            <Progress
              value={
                sub.isIndeterminate ? 100 : clampPercent(sub.progressPercent)
              }
              max={100}
              className="mt-1.5 h-1"
            />
          </div>
        )}
      </Collapse>

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
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
          value={!isPaused && speed && speed > 0 ? format.speed(speed) : "—"}
        />
      </div>

      {!isDone && (
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isCancelling}
            onClick={() => void toggleInstallPause()}
          >
            {isPaused ? (
              <Play className="size-3.5" />
            ) : (
              <Pause className="size-3.5" />
            )}
            {isPaused
              ? t("installationProgress.resume")
              : t("installationProgress.pause")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive hover:text-destructive"
            disabled={isCancelling}
            onClick={() => void cancelActiveInstall()}
          >
            {isCancelling ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            {t("common.cancel")}
          </Button>
        </div>
      )}
    </section>
  );
}

function QueueList() {
  const queued = useAtomValue(installQueuedAtom);
  const { t } = useTranslation();

  if (queued.length === 0) return null;

  return (
    <section className="shrink-0 border-b border-border py-3">
      <SectionLabel>{t("taskCenter.queued")}</SectionLabel>
      <ul>
        {queued.map((task) => (
          <li
            key={task.id}
            className="flex h-8 items-center gap-2 px-3.5 text-xs"
          >
            <Clock className="size-3.5 shrink-0 text-faint" />
            <span
              className={`size-1.5 shrink-0 rounded-full ${getLoaderInfo(task.loaderName).dot}`}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {task.label}
            </span>
            <Hint content={t("common.cancel")}>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-faint transition-colors hover:text-destructive"
                aria-label={t("common.cancel")}
                onClick={() => cancelQueuedInstall(task.id)}
              >
                <X className="size-3.5" />
              </button>
            </Hint>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StageLog() {
  const log = useAtomValue(installStageLogAtom);
  const progress = useAtomValue(installProgressAtom);
  const stages = usePacedStageLog(log);
  const transition = motionTransition(useReducedMotion());
  const format = useInstallFormatters();
  const { t } = useTranslation();

  if (!progress || stages.length === 0) return null;

  const now = Date.now();
  const rows = buildStageRows(stages, stagePlan(progress.operation)).slice(
    -STAGE_LOG_VISIBLE,
  );

  return (
    <section className="py-3">
      <SectionLabel>{t("taskCenter.stages")}</SectionLabel>
      <LazyMotion features={domAnimation}>
        <ol
          style={{ height: STAGE_LOG_VISIBLE * STAGE_ROW_HEIGHT }}
          className="flex flex-col overflow-hidden px-3.5"
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
                className="flex shrink-0 items-center gap-2 text-xs"
              >
                {row.state === "running" ? (
                  <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
                ) : row.state === "done" ? (
                  <Check className="size-3 shrink-0 text-success" />
                ) : (
                  <span className="flex size-3 shrink-0 items-center justify-center">
                    <span className="size-1.5 rounded-full bg-muted-foreground/35" />
                  </span>
                )}
                <span
                  className={`min-w-0 flex-1 truncate ${
                    row.state === "running"
                      ? "text-foreground"
                      : row.state === "done"
                        ? "text-muted-foreground"
                        : "text-faint"
                  }`}
                >
                  {t(`installationProgress.stages.${row.stage}`)}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
                  {row.event
                    ? format.elapsed(stageElapsed(row.event, now))
                    : ""}
                </span>
              </m.li>
            ))}
          </AnimatePresence>
        </ol>
      </LazyMotion>
    </section>
  );
}

function HistoryRow({ record }: { record: TaskRecord }) {
  const setView = useSetAtom(taskCenterViewAtom);
  const setFailures = useSetAtom(installFailuresAtom);
  const versions = useAtomValue(versionsAtom);
  const format = useInstallFormatters();
  const { t } = useTranslation();

  const Icon =
    record.outcome === "done"
      ? Check
      : record.outcome === "partial"
        ? AlertTriangle
        : record.outcome === "cancelled"
          ? Ban
          : CircleSlash;

  const instance = versions.find(
    (item) => item.version.name === record.versionName,
  );

  const open = () => {
    if (!instance) return;
    closeTaskCenter();
    navigate({ name: "instance", id: instanceKey(instance) });
  };

  return (
    <li className="flex h-9 items-center gap-2 px-3.5 text-xs">
      <Icon className={`size-3.5 shrink-0 ${OUTCOME_TONE[record.outcome]}`} />
      <Hint
        content={record.versionName}
        variant="text"
        truncatedOnly
        wrapperClassName="min-w-0 flex-1"
      >
        <button
          type="button"
          disabled={!instance}
          onClick={open}
          className="min-w-0 flex-1 truncate text-left text-muted-foreground transition-colors enabled:hover:text-foreground disabled:cursor-default"
        >
          {record.versionName}
        </button>
      </Hint>
      {record.outcome === "partial" && record.failures ? (
        <button
          type="button"
          className="shrink-0 text-[11px] text-warning underline-offset-2 hover:underline"
          onClick={() => {
            setFailures(record.failures ?? null);
            setView("failures");
          }}
        >
          {t("taskCenter.showFailures")}
        </button>
      ) : (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
          {record.bytes > 0 ? `${format.bytes(record.bytes)} · ` : ""}
          {format.elapsed(taskDuration(record))}
        </span>
      )}
    </li>
  );
}

function HistoryList() {
  const history = useAtomValue(installHistoryAtom);
  const { t } = useTranslation();

  if (history.length === 0) return null;

  return (
    <section className="border-t border-border py-3 first:border-t-0">
      <SectionLabel>{t("taskCenter.recent")}</SectionLabel>
      <ul>
        {history.map((record) => (
          <HistoryRow key={record.id} record={record} />
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <HardDriveDownload className="size-6 text-faint" />
      <p className="text-sm text-muted-foreground">{t("taskCenter.empty")}</p>
      <p className="text-xs text-faint">{t("taskCenter.emptyHint")}</p>
    </div>
  );
}

export function TaskCenterPanel() {
  const view = useAtomValue(taskCenterViewAtom);
  const progress = useAtomValue(installProgressAtom);
  const queued = useAtomValue(installQueuedAtom);
  const history = useAtomValue(installHistoryAtom);
  const failures = useAtomValue(installFailuresAtom);
  const setView = useSetAtom(taskCenterViewAtom);
  const { t } = useTranslation();

  if (view === "failures" && failures) return <FailuresView info={failures} />;

  const isEmpty = !progress && queued.length === 0 && history.length === 0;

  return (
    <div className="flex max-h-[35rem] flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3.5">
        <span className="text-sm font-medium text-foreground">
          {t("taskCenter.title")}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <MirrorChip />
        </span>
      </header>

      <ActiveTask />
      <QueueList />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            <StageLog />
            <HistoryList />
          </>
        )}
      </div>

      <footer className="flex h-11 shrink-0 items-center gap-1 border-t border-border px-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openConnectivityCheck}
        >
          <Wifi className="size-3.5" />
          {t("taskCenter.checkConnection")}
        </Button>
        {failures && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={() => setView("failures")}
          >
            <AlertTriangle className="size-3.5" />
            {t("taskCenter.failures", { count: failures.failedItems })}
          </Button>
        )}
      </footer>
    </div>
  );
}
