import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  installPausedAtom,
  installProgressAtom,
  installSpeedAtom,
} from "./installUi";
import { clampPercent, resolveStagePlan, stageLabelKey } from "./progressModel";
import { useInstallFormatters } from "./useInstallFormatters";

export function InstallStageStrip() {
  const { t } = useTranslation();
  const format = useInstallFormatters();
  const progress = useAtomValue(installProgressAtom);
  const speed = useAtomValue(installSpeedAtom);
  const isPaused = useAtomValue(installPausedAtom);

  if (!progress) return null;

  const plan = resolveStagePlan(progress);
  const index = plan.indexOf(progress.stage);
  const percent = clampPercent(progress.progressPercent);
  const indeterminate = Boolean(progress.isIndeterminate);

  return (
    <div className="flex min-w-0 flex-col gap-1.5" role="status" aria-live="polite">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {isPaused
            ? t("installationProgress.paused")
            : t(stageLabelKey(progress.stage, progress.operation))}
        </span>
        <span className="ml-auto flex shrink-0 items-baseline gap-2 font-mono text-[0.7rem] text-faint tabular-nums">
          {index !== -1 && plan.length > 1 && (
            <span>
              {index + 1}/{plan.length}
            </span>
          )}
          {!isPaused && speed !== null && speed > 0 && (
            <span>{format.speed(speed)}</span>
          )}
          <span className="text-muted-foreground">
            {indeterminate ? "…" : `${percent}%`}
          </span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
        {indeterminate ? (
          <div className="stage-sweep relative size-full" />
        ) : (
          <div
            className="h-full rounded-full bg-primary/80 transition-[width] duration-300 ease-swift"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
    </div>
  );
}
