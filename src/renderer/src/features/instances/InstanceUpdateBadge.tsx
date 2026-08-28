import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { getLoaderInfo } from "@renderer/components/Loaders";
import { InstanceStatusChip } from "./InstanceStatusChip";
import {
  instanceUpdateSummariesAtom,
  requestUpdateDetails,
} from "./updateCheck";
import {
  UpdateSummary,
  hasUpdateDetails,
  invertUpdateSummary,
  summaryCounts,
} from "./updateSummary";

function ChangeRow({
  label,
  from,
  to,
}: {
  label: string;
  from: string;
  to: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="shrink-0 opacity-65">{label}</span>
      <span className="min-w-0 font-mono">
        {from} → {to}
      </span>
    </span>
  );
}

export function UpdateSummaryHint({
  summary: incoming,
  isDownloaded,
}: {
  summary?: UpdateSummary;
  isDownloaded?: boolean;
}) {
  const { t } = useTranslation();
  const title = isDownloaded
    ? t("versions.update.source")
    : t("versions.update.publishedAhead");
  const summary =
    !incoming || isDownloaded ? incoming : invertUpdateSummary(incoming);

  if (!summary) {
    return (
      <span className="grid gap-1 text-left">
        <span className="font-medium">{title}</span>
        <span className="opacity-70">{t("versions.update.pending")}</span>
      </span>
    );
  }

  const counts = summaryCounts(summary);
  const parts: string[] = [];

  if (counts.updated > 0) {
    parts.push(t("modpackDiff.countUpdated", { count: counts.updated }));
  }
  if (counts.added > 0) {
    parts.push(t("modpackDiff.countAdded", { count: counts.added }));
  }
  if (counts.removed > 0) {
    parts.push(t("modpackDiff.countRemoved", { count: counts.removed }));
  }

  return (
    <span className="grid gap-1 text-left">
      <span className="font-medium">{title}</span>

      {parts.length > 0 ? (
        <span className="tabular-nums opacity-80">{parts.join(" · ")}</span>
      ) : hasUpdateDetails(summary) ? null : (
        <span className="tabular-nums opacity-80">
          {t("versions.update.nothing")}
        </span>
      )}

      {summary.gameVersion && (
        <ChangeRow
          label={t("versions.update.gameVersion")}
          from={summary.gameVersion.from}
          to={summary.gameVersion.to}
        />
      )}

      {summary.loader && (
        <ChangeRow
          label={t("versions.loader")}
          from={getLoaderInfo(summary.loader.from).name}
          to={getLoaderInfo(summary.loader.to).name}
        />
      )}

      {hasUpdateDetails(summary) && (
        <span className="pt-0.5 text-[0.65rem] opacity-60">
          {t("versions.update.openHint")}
        </span>
      )}
    </span>
  );
}

export function InstanceUpdateBadge({
  itemKey,
  isDownloaded,
  onOpen,
  className,
}: {
  itemKey: string;
  isDownloaded?: boolean;
  onOpen: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const summary = useAtomValue(instanceUpdateSummariesAtom)[itemKey];

  return (
    <Hint
      variant="text"
      className="max-w-72"
      content={
        <UpdateSummaryHint summary={summary} isDownloaded={isDownloaded} />
      }
    >
      <button
        type="button"
        aria-label={t("versions.state.needsUpdate")}
        className={cn(
          "shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
        onClick={(event) => {
          event.stopPropagation();
          requestUpdateDetails(itemKey);
          onOpen();
        }}
      >
        <InstanceStatusChip
          kind="update"
          className="cursor-pointer hover:bg-warning/20"
        />
      </button>
    </Hint>
  );
}
