import { useTranslation } from "react-i18next";
import { CloudDownload, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { InstanceStatusKind } from "./instanceStatus";

const TONE: Record<InstanceStatusKind, string> = {
  running: "border-success/30 bg-success/12 text-success",
  broken: "border-destructive/30 bg-destructive/12 text-destructive",
  update: "border-warning/30 bg-warning/12 text-warning",
  downloaded: "border-border bg-surface-3 text-muted-foreground",
};

export function InstanceStatusChip({
  kind,
  detail,
  className,
}: {
  kind: InstanceStatusKind;
  detail?: string;
  className?: string;
}) {
  const { t } = useTranslation();

  const label =
    kind === "running"
      ? t("versions.running")
      : kind === "broken"
        ? t("versions.state.notInstalled")
        : kind === "update"
          ? t("versions.state.needsUpdate")
          : t("versions.downloadedLabel");

  return (
    <span
      className={cn(
        "flex h-5 shrink-0 items-center gap-1.5 rounded-md border px-1.5 text-[0.65rem] font-medium whitespace-nowrap",
        TONE[kind],
        className,
      )}
    >
      {kind === "running" && (
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-success" />
      )}
      {kind === "update" && <CloudDownload className="size-3 shrink-0" />}
      {kind === "broken" && <TriangleAlert className="size-3 shrink-0" />}
      {kind === "downloaded" && <CloudDownload className="size-3 shrink-0" />}
      <span className="truncate">{label}</span>
      {detail && (
        <span className="font-mono tabular-nums opacity-80">{detail}</span>
      )}
    </span>
  );
}
