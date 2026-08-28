import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  AppWindow,
  Archive,
  Boxes,
  Coffee,
  FolderOpen,
  Image as ImageIcon,
  Library,
  Loader2,
  MoreHorizontal,
  Package,
  PackageX,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isRunningAtom, pathsAtom } from "@renderer/stores/atoms";
import { formatBytes } from "@renderer/utilities/file";
import { showFailureToast } from "@renderer/utilities/failures";
import type { StorageBreakdown, StorageCategoryId } from "@/types/Storage";
import { Highlighted, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";
import {
  cleanupOffers,
  storageSlices,
  topVersions,
  totalReclaimable,
  type CleanupAction,
} from "./storageModel";

const api = window.api;

const VERSION_LIMIT = 5;

let cachedBreakdown: StorageBreakdown | null = null;

const CATEGORY_ICON: Record<StorageCategoryId, LucideIcon> = {
  versions: Boxes,
  assets: ImageIcon,
  java: Coffee,
  libraries: Library,
  backups: Archive,
  appData: AppWindow,
  other: MoreHorizontal,
};

const CATEGORY_COLOR: Record<StorageCategoryId, string> = {
  versions: "bg-chart-1",
  libraries: "bg-chart-2",
  assets: "bg-chart-3",
  java: "bg-chart-4",
  backups: "bg-chart-5",
  appData: "bg-muted-foreground",
  other: "bg-faint",
};

const ACTION_ICON: Record<CleanupAction, LucideIcon> = {
  cache: Trash2,
  java: Coffee,
  libraries: Library,
  backups: Archive,
  instances: PackageX,
};

export function StorageSection({
  onTotalChange,
  visible,
  query,
}: {
  onTotalChange?: (total: string) => void;
  visible: (id: SettingsEntryId) => boolean;
  query: string;
}) {
  const { t } = useTranslation();
  const paths = useAtomValue(pathsAtom);
  const isRunning = useAtomValue(isRunningAtom);
  const [data, setData] = useState<StorageBreakdown | null>(cachedBreakdown);
  const [isScanning, setScanning] = useState(false);
  const [isFailed, setFailed] = useState(false);
  const [busy, setBusy] = useState<CleanupAction | null>(null);
  const [pending, setPending] = useState<CleanupAction | null>(null);
  const mounted = useRef(true);

  const sizes = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];
  const bytes = (value: number) => formatBytes(value, sizes, 1);

  const load = useCallback(async () => {
    setScanning(true);
    try {
      const result = await api.storage.getBreakdown();
      cachedBreakdown = result.failed ? null : result;
      if (!mounted.current) return;
      setData(cachedBreakdown);
      setFailed(Boolean(result.failed));
    } catch {
      if (!mounted.current) return;
      setFailed(true);
    } finally {
      if (mounted.current) setScanning(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!cachedBreakdown) void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (data) onTotalChange?.(bytes(data.total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const isLoading = isScanning && !data;
  const rootPath = data?.rootPath || paths.launcher;
  const slices = storageSlices(data);
  const offers = cleanupOffers(data);
  const reclaimable = totalReclaimable(data);
  const versions = topVersions(data, VERSION_LIMIT);
  const locked = isRunning;
  const showUsage = visible("storageUsage");
  const showCleanup = visible("storageCleanup");

  const run = async (action: CleanupAction) => {
    setPending(null);
    setBusy(action);
    try {
      const result =
        action === "cache"
          ? await api.storage.clearCache()
          : await api.storage.cleanup(
              action,
              action === "instances"
                ? (data?.cleanup.instances.names ?? [])
                : undefined,
            );

      if (result.blocked) {
        toast.error(t("settings.storage.busy"));
      } else if (result.failed) {
        showFailureToast(t("settings.storage.actionFailed"), undefined, {
          channels: ["storage:", "fs:"],
          fallbackDescription: t("settings.storage.actionFailedHint"),
        });
      } else {
        toast.success(
          t("settings.storage.cleared", { size: bytes(result.freed) }),
        );

        if (result.kept?.length) {
          toast.warning(
            t("settings.storage.cleanupInstancesKept", {
              names: result.kept.join(", "),
            }),
          );
        }
      }
      await load();
    } catch (error) {
      if (mounted.current) {
        showFailureToast(t("settings.storage.actionFailed"), error, {
          channels: ["storage:", "fs:"],
          fallbackDescription: t("settings.storage.actionFailedHint"),
        });
      }
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const confirmCopy = (action: CleanupAction) => {
    if (action === "instances") {
      const names = data?.cleanup.instances.names ?? [];
      const dataNames = data?.cleanup.instances.dataNames ?? [];
      return {
        title: t("settings.storage.cleanupInstancesConfirmTitle"),
        body: [
          t("settings.storage.cleanupInstancesConfirmBody", {
            names: names.join(", "),
          }),
          dataNames.length > 0
            ? t("settings.storage.cleanupInstancesData", {
                names: dataNames.join(", "),
              })
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
    }

    const map = {
      cache: "clearCache",
      java: "cleanupJava",
      libraries: "cleanupLibraries",
      backups: "cleanupBackups",
    } as const;

    return {
      title: t(`settings.storage.${map[action]}ConfirmTitle`),
      body: t(`settings.storage.${map[action]}ConfirmBody`),
    };
  };

  return (
    <div className="flex flex-col gap-4">
      {showUsage && (
        <div className="rounded-xl border border-border bg-card p-3.5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-faint">
                {t("settings.storage.totalLabel")}
              </p>
              <p className="font-mono text-2xl leading-tight font-semibold tabular-nums text-foreground">
                {isLoading ? "…" : isFailed ? "—" : bytes(data?.total ?? 0)}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-faint">
                {isScanning && <Loader2 className="size-3 animate-spin" />}
                {isScanning
                  ? t("settings.storage.scanning")
                  : t("settings.storage.rootHint")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => rootPath && void api.shell.openPath(rootPath)}
                disabled={!rootPath}
              >
                <FolderOpen className="size-3.5" />
                {t("settings.storage.openFolder")}
              </Button>
              <Hint content={t("settings.storage.refresh")}>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => void load()}
                  disabled={isScanning || busy !== null}
                  aria-label={t("settings.storage.refresh")}
                >
                  {isScanning ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                </Button>
              </Hint>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="mt-3 h-2.5 w-full rounded-full" />
          ) : isFailed ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <TriangleAlert className="size-4 text-warning" />
              {t("settings.storage.loadError")}
            </p>
          ) : slices.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("settings.storage.empty")}
            </p>
          ) : (
            <div className="mt-3 flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-3">
              {slices.map((slice) => (
                <Hint
                  key={slice.id}
                  content={`${t(`settings.storage.categories.${slice.id}`)} — ${bytes(slice.size)}`}
                >
                  <span
                    className={cn("h-full", CATEGORY_COLOR[slice.id])}
                    style={{ flexGrow: slice.size }}
                  />
                </Hint>
              ))}
            </div>
          )}
        </div>
      )}

      {showCleanup && !isLoading && reclaimable > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-surface-2 px-3.5 py-2">
          <Sparkles className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
            {t("settings.storage.reclaimBanner", { size: bytes(reclaimable) })}
          </p>
        </div>
      )}

      <div
        className={cn(
          "grid items-start gap-4",
          showUsage && showCleanup ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {showUsage && (
          <SettingsGroup
            title={
              <Highlighted
                text={t("settings.storage.categoriesTitle")}
                query={query}
              />
            }
          >
            {isLoading ? (
              <div className="space-y-2 px-3.5 py-3">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-4 w-full" />
                ))}
              </div>
            ) : slices.length === 0 ? (
              <p className="px-3.5 py-3 text-xs text-faint">
                {t("settings.storage.empty")}
              </p>
            ) : (
              slices.map((slice) => {
                const Icon = CATEGORY_ICON[slice.id];
                return (
                  <div
                    key={slice.id}
                    className="flex items-center gap-2.5 px-3.5 py-1.5"
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-[3px]",
                        CATEGORY_COLOR[slice.id],
                      )}
                    />
                    <Icon className="size-3.5 shrink-0 text-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {t(`settings.storage.categories.${slice.id}`)}
                      </p>
                      <p className="truncate text-[0.7rem] text-faint">
                        {t(`settings.storage.categoriesDesc.${slice.id}`)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-xs tabular-nums text-foreground">
                        {bytes(slice.size)}
                      </p>
                      <p className="font-mono text-[0.65rem] tabular-nums text-faint">
                        {slice.percent}%
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </SettingsGroup>
        )}

        <div className="flex flex-col gap-4">
          {showCleanup && (
            <SettingsGroup
              title={
                <Highlighted
                  text={t("settings.storage.reclaimTitle")}
                  query={query}
                />
              }
              hint={reclaimable > 0 ? bytes(reclaimable) : undefined}
            >
              {isLoading ? (
                <div className="space-y-2 px-3.5 py-3">
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-full" />
                </div>
              ) : offers.length === 0 ? (
                <p className="flex items-center gap-2 px-3.5 py-3 text-xs text-faint">
                  <Sparkles className="size-3.5" />
                  {t("settings.storage.nothingToClean")}
                </p>
              ) : (
                <>
                  {locked && (
                    <p className="px-3.5 py-2 text-[0.7rem] leading-snug text-warning">
                      {t("settings.storage.busy")}
                    </p>
                  )}
                  {offers.map((offer) => {
                    const Icon = ACTION_ICON[offer.action];
                    return (
                      <button
                        key={offer.action}
                        type="button"
                        disabled={busy !== null || locked}
                        onClick={() => setPending(offer.action)}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy === offer.action ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                        ) : (
                          <Icon
                            className={cn(
                              "size-3.5 shrink-0",
                              offer.destructive ? "text-warning" : "text-faint",
                            )}
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {t(`settings.storage.offers.${offer.action}`)}
                          </span>
                          {offer.count > 0 && (
                            <span className="block truncate text-[0.7rem] text-faint">
                              {t("settings.storage.offerCount", {
                                value: offer.count,
                              })}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {bytes(offer.size)}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </SettingsGroup>
          )}

          {showUsage && !isLoading && versions.entries.length > 0 && (
            <SettingsGroup
              title={t("settings.storage.byVersion")}
              hint={t("settings.storage.byVersionHint")}
            >
              {versions.entries.map((version) => (
                <div key={version.name} className="px-3.5 py-1.5">
                  <div className="flex items-center gap-2">
                    <Package className="size-3 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {version.name}
                    </span>
                    <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                      {bytes(version.size)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full bg-muted-foreground/50"
                      style={{ width: `${version.percent}%` }}
                    />
                  </div>
                </div>
              ))}
              {versions.rest > 0 && (
                <p className="px-3.5 py-1.5 text-[0.7rem] text-faint">
                  {t("settings.storage.restCount", { value: versions.rest })}
                </p>
              )}
            </SettingsGroup>
          )}
        </div>
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          {pending && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmCopy(pending).title}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmCopy(pending).body}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <Button variant="destructive" onClick={() => void run(pending)}>
                  <Trash2 className="size-4" />
                  {t(`settings.storage.offers.${pending}`)}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
