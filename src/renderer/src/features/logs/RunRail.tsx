import { useTranslation } from "react-i18next";
import {
  CircleCheck,
  CircleDashed,
  FileText,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { formatDate, formatTime } from "@renderer/utilities/date";
import { LogRun, describeExitCode } from "./runs";

export function RunRail({
  runs,
  selected,
  elapsed,
  onSelect,
}: {
  runs: LogRun[];
  selected: string | null;
  elapsed: string;
  onSelect: (key: string) => void;
}) {
  const { t } = useTranslation();
  const timeLabels = { h: t("time.h"), m: t("time.m"), s: t("time.s") };

  return (
    <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto pr-1">
      {runs.map((run) => {
        const active = run.key === selected;
        const live = run.kind === "live" && run.status === "running";
        const failed = run.crashed;
        const exit = describeExitCode(run.exitCode);

        const Icon = live
          ? Zap
          : failed
            ? TriangleAlert
            : run.recovered
              ? CircleDashed
              : run.kind === "file"
                ? FileText
                : CircleCheck;

        const detail = live
          ? elapsed
          : run.kind === "file"
            ? run.sources.report?.name || run.sources.log?.name || ""
            : [
                failed
                  ? t(`logs.exit.${exit.verdict}`)
                  : run.recovered
                    ? t("logs.exit.recovered")
                    : t("logs.exit.ok"),
                run.durationSec
                  ? formatTime(run.durationSec, timeLabels)
                  : null,
                run.account,
              ]
                .filter(Boolean)
                .join(" · ");

        return (
          <button
            key={run.key}
            type="button"
            onClick={() => onSelect(run.key)}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors outline-none focus-visible:border-ring",
              active
                ? "border-primary/40 bg-surface-3"
                : "hover:bg-surface-3/70",
            )}
          >
            <Icon
              className={cn(
                "size-3.5 shrink-0",
                live
                  ? "text-success"
                  : failed
                    ? "text-destructive"
                    : "text-faint",
              )}
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {live ? t("logs.now") : formatDate(new Date(run.startedAt))}
              </p>
              <Hint content={detail} variant="text" truncatedOnly>
                <p className="truncate text-[0.65rem] text-faint">{detail}</p>
              </Hint>
            </div>

            {run.sources.report && !live && (
              <FileText className="size-3 shrink-0 text-destructive/70" />
            )}
          </button>
        );
      })}
    </div>
  );
}
