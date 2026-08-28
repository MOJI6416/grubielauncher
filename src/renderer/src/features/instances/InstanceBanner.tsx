import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  CloudDownload,
  Loader2,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Version } from "@renderer/classes/Version";
import { VersionDiffence } from "./atoms";
import {
  UpdateSummary,
  hasUpdateDetails,
  summaryCounts,
} from "./updateSummary";

export function hasInstanceBanner(input: {
  versionDiffence: VersionDiffence;
  hasManifest: boolean;
}): boolean {
  return input.versionDiffence === "old" || !input.hasManifest;
}

export function InstanceBanner({
  instance,
  versionDiffence,
  updateSummary,
  isUpdateDetailsOpen,
  onToggleUpdateDetails,
  isSyncing,
  canSync,
  onSync,
  isChecking,
  canRepair,
  onRepair,
}: {
  instance: Version;
  versionDiffence: VersionDiffence;
  updateSummary?: UpdateSummary;
  isUpdateDetailsOpen: boolean;
  onToggleUpdateDetails: () => void;
  isSyncing: boolean;
  canSync: boolean;
  onSync: () => void;
  isChecking: boolean;
  canRepair: boolean;
  onRepair: () => void;
}) {
  const { t } = useTranslation();

  if (versionDiffence === "old") {
    const counts = updateSummary ? summaryCounts(updateSummary) : null;
    const isDownloaded = instance.version.downloadedVersion;

    return (
      <div className="flex shrink-0 items-center gap-3 rounded-xl border border-warning/40 bg-surface-2 px-3.5 py-2.5">
        <CloudDownload className="size-4 shrink-0 text-warning" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {isDownloaded
              ? t("versions.hostChanged")
              : t("versions.update.publishedAhead")}
          </span>
          <span className="flex min-w-0 items-center gap-2 truncate text-xs text-muted-foreground">
            {!isDownloaded ? (
              <span className="min-w-0 truncate">
                {t("versions.updateAheadHint")}
              </span>
            ) : counts && counts.total > 0 ? (
              <>
                {counts.added > 0 && (
                  <span className="shrink-0 text-success tabular-nums">
                    {t("modpackDiff.countAdded", { count: counts.added })}
                  </span>
                )}
                {counts.updated > 0 && (
                  <span className="shrink-0 text-foreground tabular-nums">
                    {t("modpackDiff.countUpdated", {
                      count: counts.updated,
                    })}
                  </span>
                )}
                {counts.removed > 0 && (
                  <span className="shrink-0 text-destructive tabular-nums">
                    {t("modpackDiff.countRemoved", {
                      count: counts.removed,
                    })}
                  </span>
                )}
              </>
            ) : (
              t("versions.synchronizeDescription")
            )}
          </span>
          {isDownloaded && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-warning">
              <TriangleAlert className="size-3 shrink-0" />
              <span className="min-w-0 truncate">
                {t("versions.syncReplacesFiles")}
              </span>
            </span>
          )}
        </div>

        {updateSummary && hasUpdateDetails(updateSummary) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={isUpdateDetailsOpen}
            onClick={onToggleUpdateDetails}
          >
            {t(
              isDownloaded
                ? "versions.update.sectionTitle"
                : "versions.update.publishSectionTitle",
            )}
            <ChevronDown
              className={cn(
                "transition-transform",
                isUpdateDetailsOpen && "rotate-180",
              )}
            />
          </Button>
        )}

        {isDownloaded && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canSync}
            onClick={onSync}
          >
            {isSyncing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <CloudDownload />
            )}
            {t("versions.synchronize")}
          </Button>
        )}
      </div>
    );
  }

  if (!instance.hasManifest) {
    return (
      <div className="flex shrink-0 items-center gap-3 rounded-xl border border-destructive/40 bg-surface-2 px-3.5 py-2.5">
        <TriangleAlert className="size-4 shrink-0 text-destructive" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">
            {t("versions.state.notInstalled")}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {t("versions.repairHint")}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canRepair}
          onClick={onRepair}
        >
          {isChecking ? <Loader2 className="animate-spin" /> : <ScanLine />}
          {t("versions.repair")}
        </Button>
      </div>
    );
  }

  return null;
}
