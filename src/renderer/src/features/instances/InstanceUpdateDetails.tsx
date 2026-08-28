import { useTranslation } from "react-i18next";
import { CloudDownload, PackageCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isEmptyDiff } from "@/shared/modpackDiff";
import { getLoaderInfo } from "@renderer/components/Loaders";
import { ModpackDiffPanel } from "./ModpackDiffPanel";
import { UpdateSummary, invertUpdateSummary } from "./updateSummary";

export function InstanceUpdateDetails({
  summary: incoming,
  isDownloaded,
  onClose,
}: {
  summary: UpdateSummary;
  isDownloaded?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const summary = isDownloaded ? incoming : invertUpdateSummary(incoming);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex h-7 shrink-0 items-center gap-2">
        <CloudDownload className="size-3.5 shrink-0 text-warning" />
        <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {t(
            isDownloaded
              ? "versions.update.sectionTitle"
              : "versions.update.publishSectionTitle",
          )}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[0.7rem] text-faint"
          onClick={onClose}
        >
          <X />
          {t("common.close")}
        </Button>
      </div>

      {(summary.gameVersion || summary.loader) && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-xs">
          {summary.gameVersion && (
            <span className="flex items-center gap-1.5">
              <span className="text-faint">
                {t("versions.update.gameVersion")}
              </span>
              <span className="font-mono">
                {summary.gameVersion.from} → {summary.gameVersion.to}
              </span>
            </span>
          )}
          {summary.loader && (
            <span className="flex items-center gap-1.5">
              <span className="text-faint">{t("versions.loader")}</span>
              <span className="font-mono">
                {getLoaderInfo(summary.loader.from).name} →{" "}
                {getLoaderInfo(summary.loader.to).name}
              </span>
            </span>
          )}
        </div>
      )}

      {isEmptyDiff(summary.diff) ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-6 text-center">
          <PackageCheck className="size-5 text-faint" />
          <p className="text-xs font-medium text-muted-foreground">
            {t("modpackDiff.unchanged", { count: summary.diff.unchanged })}
          </p>
        </div>
      ) : (
        <ModpackDiffPanel fill diff={summary.diff} />
      )}
    </div>
  );
}
