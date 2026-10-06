import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  FileWarning,
  Files,
  Layers,
  Loader2,
  Pin,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { isEmptyDiff } from "@/shared/modpackDiff";
import { modpackMergeDiff } from "@/shared/modpackMerge";
import { ModpackDiffPanel } from "@renderer/features/instances/ModpackDiffPanel";
import type { PreparedModpackUpdate } from "./modpackUpdate";
import { modpackVersionLabel } from "./modpackVersions";

function Note({
  icon: Icon,
  tone = "muted",
  children,
  action,
}: {
  icon: LucideIcon;
  tone?: "muted" | "warning";
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex min-h-8 items-center gap-2 px-3 py-1.5 text-xs">
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          tone === "warning" ? "text-warning" : "text-faint",
        )}
      />
      <span className="min-w-0 flex-1 text-muted-foreground">{children}</span>
      {action}
    </li>
  );
}

export function ModpackUpdatePreview({
  update,
  currentLabel,
  isOlder,
  restoreRemoved,
  isApplying,
  onRestoreRemovedChange,
  onCancel,
  onApply,
}: {
  update: PreparedModpackUpdate;
  currentLabel: string;
  isOlder: boolean;
  restoreRemoved: boolean;
  isApplying: boolean;
  onRestoreRemovedChange: (value: boolean) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  const { merge, files } = update;
  const targetLabel = modpackVersionLabel(update.target);

  const diff = useMemo(() => modpackMergeDiff(merge), [merge]);
  const replaced = merge.updated.filter((item) => item.replacedUserVersion);
  const removedCount = restoreRemoved ? 0 : merge.removedByUser.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="surface-lit flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2 font-mono text-sm font-medium">
            <span className="truncate text-muted-foreground">{currentLabel}</span>
            <ArrowRight className="size-3.5 shrink-0 text-faint" />
            <span className="truncate">{targetLabel}</span>
          </p>
          <p className="mt-0.5 text-xs text-faint">
            {t(isOlder ? "modpack.preview.olderTitle" : "modpack.preview.title")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isApplying}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isApplying}
          onClick={onApply}
        >
          {isApplying && <Loader2 className="animate-spin" />}
          {t(isOlder ? "modpack.preview.switch" : "modpack.preview.apply")}
        </Button>
      </div>

      {isOlder && (
        <p className="flex shrink-0 items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {t("modpack.preview.olderWarning")}
        </p>
      )}

      <ul className="shrink-0 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {update.loaderTarget && (
          <Note icon={Layers}>
            {t("modpack.preview.loader", { version: update.loaderTarget })}
          </Note>
        )}
        {merge.own.length > 0 && (
          <Note icon={UserRound}>
            {t("modpack.preview.own", { count: merge.own.length })}
          </Note>
        )}
        {merge.removedByUser.length > 0 && (
          <Note
            icon={Trash2}
            action={
              <label className="flex shrink-0 items-center gap-1.5 text-faint">
                {t("modpack.preview.restoreRemoved")}
                <Switch
                  size="sm"
                  checked={restoreRemoved}
                  disabled={isApplying}
                  onCheckedChange={onRestoreRemovedChange}
                />
              </label>
            }
          >
            {restoreRemoved
              ? t("modpack.preview.removedRestored", {
                  count: merge.removedByUser.length,
                })
              : t("modpack.preview.removedByUser", { count: removedCount })}
          </Note>
        )}
        {merge.keptPinned.length > 0 && (
          <Note icon={Pin}>
            {t("modpack.preview.pinned", { count: merge.keptPinned.length })}
          </Note>
        )}
        {replaced.length > 0 && (
          <Note icon={FileWarning} tone="warning">
            {t("modpack.preview.replaced", { count: replaced.length })}
          </Note>
        )}
        {files.write.length > 0 && (
          <Note icon={Files}>
            {t("modpack.preview.files", { count: files.write.length })}
          </Note>
        )}
        {files.conflicts.length > 0 && (
          <Note icon={FileWarning} tone="warning">
            {t("modpack.preview.conflicts", { count: files.conflicts.length })}
          </Note>
        )}
        {files.kept.length > 0 && (
          <Note icon={Files}>
            {t("modpack.preview.kept", { count: files.kept.length })}
          </Note>
        )}
        <Note icon={ShieldCheck}>{t("modpack.preview.protected")}</Note>
      </ul>

      {isEmptyDiff(diff) ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card px-6 text-center text-xs text-muted-foreground">
          {t("modpack.preview.sameMods")}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <ModpackDiffPanel fill diff={diff} />
        </div>
      )}
    </div>
  );
}
