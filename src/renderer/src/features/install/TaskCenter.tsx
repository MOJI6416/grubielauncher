import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { AlertTriangle, HardDriveDownload, Pause } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Hint } from "@renderer/components/Hint";
import { clampPercent } from "./progressModel";
import { TaskCenterPanel } from "./TaskCenterPanel";
import {
  installFailuresAtom,
  installFailuresSeenAtom,
  installPausedAtom,
  installProgressAtom,
  installQueuedAtom,
  taskCenterOpenAtom,
  taskCenterViewAtom,
} from "./installUi";

function ProgressRing({ percent }: { percent: number | null }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const dash = percent === null ? circumference * 0.28 : 0;

  return (
    <svg
      viewBox="0 0 16 16"
      className={`size-3.5 shrink-0 -rotate-90 ${
        percent === null ? "animate-spin" : ""
      }`}
      aria-hidden
    >
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeWidth="2"
        className="stroke-muted-foreground/25"
      />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-swift"
        strokeDasharray={
          percent === null ? `${dash} ${circumference}` : circumference
        }
        strokeDashoffset={
          percent === null ? 0 : circumference * (1 - percent / 100)
        }
      />
    </svg>
  );
}

export function TaskCenter() {
  const [isOpen, setOpen] = useAtom(taskCenterOpenAtom);
  const setView = useSetAtom(taskCenterViewAtom);
  const progress = useAtomValue(installProgressAtom);
  const queued = useAtomValue(installQueuedAtom);
  const failures = useAtomValue(installFailuresAtom);
  const failuresSeen = useAtomValue(installFailuresSeenAtom);
  const isPaused = useAtomValue(installPausedAtom);
  const { t } = useTranslation();

  const hasUnseenFailures = Boolean(failures) && !failuresSeen;

  const percent =
    progress && !progress.isIndeterminate
      ? clampPercent(progress.progressPercent)
      : null;

  const trigger = progress ? (
    <button
      type="button"
      className="flex h-7 min-w-0 max-w-52 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 transition-colors hover:border-input"
    >
      {isPaused ? (
        <Pause className="size-3.5 shrink-0 text-warning" />
      ) : (
        <ProgressRing percent={percent} />
      )}
      <span className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">
        {progress.versionName}
      </span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
        {percent === null ? "…" : `${percent}%`}
      </span>
      {queued.length > 0 && (
        <span className="shrink-0 rounded bg-surface-3 px-1 font-mono text-[10px] tabular-nums text-faint">
          +{queued.length}
        </span>
      )}
    </button>
  ) : hasUnseenFailures ? (
    <button
      type="button"
      className="flex h-7 items-center gap-1.5 rounded-lg border border-destructive/40 bg-surface-2 px-2.5 text-destructive transition-colors hover:border-destructive/70"
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="font-mono text-xs tabular-nums">
        {failures?.failedItems ?? 0}
      </span>
    </button>
  ) : (
    <button
      type="button"
      className="flex size-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-faint transition-colors hover:border-input hover:text-muted-foreground"
      aria-label={t("taskCenter.open")}
    >
      <HardDriveDownload className="size-3.5" />
    </button>
  );

  return (
    <Popover
      open={isOpen}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setView(hasUnseenFailures ? "failures" : "tasks");
      }}
    >
      <Hint content={t("taskCenter.open")} side="bottom">
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </Hint>
      <PopoverContent
        className="w-[27.5rem] p-0"
        collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <TaskCenterPanel />
      </PopoverContent>
    </Popover>
  );
}
