import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ModpackDownloadStage } from "./downloadModpack";

export function PackStageProgress({
  stage,
  progressPercent,
  extractPercent,
}: {
  stage: Exclude<ModpackDownloadStage, null>;
  progressPercent: number;
  extractPercent: number | null;
}) {
  const { t } = useTranslation();
  const label =
    stage === "extract"
      ? t("modManager.extracting")
      : t("downloadProgress.title");
  const percent = stage === "download" ? progressPercent : extractPercent;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {percent !== null && (
          <span className="font-mono tabular-nums text-faint">{percent}%</span>
        )}
      </div>
      <Progress
        value={percent ?? 100}
        max={100}
        className={cn(
          "h-1.5",
          percent === null &&
            "[&_[data-slot=progress-indicator]]:animate-pulse",
        )}
      />
    </div>
  );
}
