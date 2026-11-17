import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatClock } from "@renderer/utilities/duration";
import { usePageVisible } from "@renderer/utilities/usePageVisible";
import type { LaunchProgress, LaunchStage } from "./launchProgress";
import { Hint } from "@renderer/components/Hint";

export function StageSegments({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div className="flex h-1.5 gap-1" aria-hidden>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            "relative h-full min-w-0 flex-1 rounded-full",
            index < current
              ? "bg-info/70"
              : index === current
                ? "stage-sweep bg-info/20"
                : "bg-foreground/10",
          )}
        />
      ))}
    </div>
  );
}

function stageLabelKey(progress: LaunchProgress): string {
  const isLast = progress.plan.indexOf(progress.stage) === progress.plan.length - 1;
  const stage: LaunchStage | "game" =
    progress.stage === "java" && isLast ? "game" : progress.stage;
  return `launchStage.stages.${stage}`;
}

export function LaunchStageStrip({ progress }: { progress: LaunchProgress }) {
  const { t } = useTranslation();
  const visible = usePageVisible();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!visible) return;

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [visible]);

  const index = progress.plan.indexOf(progress.stage);

  return (
    <div className="flex min-w-0 flex-col gap-1.5" role="status" aria-live="polite">
      <div className="flex min-w-0 items-baseline gap-2">
        <Hint content={t(stageLabelKey(progress))} variant="text" truncatedOnly>
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {t(stageLabelKey(progress))}
            {progress.stage === "loader" && progress.mods !== null && (
              <span className="font-normal text-muted-foreground">
                {" · "}
                {t("modManager.modsCount", { count: progress.mods })}
              </span>
            )}
          </span>
        </Hint>
        <span className="ml-auto flex shrink-0 items-baseline gap-2 font-mono text-2xs text-faint tabular-nums">
          <span>
            {index + 1}/{progress.plan.length}
          </span>
          <span className="text-muted-foreground">
            {formatClock(now - progress.startedAt)}
          </span>
        </span>
      </div>
      <StageSegments total={progress.plan.length} current={index} />
    </div>
  );
}
