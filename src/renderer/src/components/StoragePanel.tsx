import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import {
  AlertTriangle,
  AppWindow,
  Boxes,
  Coffee,
  FolderOpen,
  Image as ImageIcon,
  Library,
  Loader2,
  MoreHorizontal,
  Package,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import type { StorageBreakdown, StorageCategoryId } from "@/types/Storage";

const api = window.api;

type CleanupAction = "cache" | "java" | "libraries";

const CATEGORY_META: Record<
  StorageCategoryId,
  { icon: LucideIcon; color: string }
> = {
  versions: { icon: Boxes, color: "bg-primary" },
  assets: { icon: ImageIcon, color: "bg-chart-1" },
  java: { icon: Coffee, color: "bg-chart-2" },
  libraries: { icon: Library, color: "bg-chart-3" },
  appData: { icon: AppWindow, color: "bg-chart-4" },
  other: { icon: MoreHorizontal, color: "bg-muted-foreground" },
};

const VERSION_LIMIT = 6;

export function StoragePanel() {
  const { t } = useTranslation();
  const [paths] = useAtom(pathsAtom);
  const [isRunning] = useAtom(isRunningAtom);
  const [data, setData] = useState<StorageBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyAction, setBusyAction] = useState<CleanupAction | null>(null);
  const [pendingAction, setPendingAction] = useState<CleanupAction | null>(null);
  const [showAllVersions, setShowAllVersions] = useState(false);
  const mounted = useRef(true);

  const sizes = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.storage.getBreakdown();
      if (mounted.current) {
        setData(result.failed ? null : result);
        setError(!!result.failed);
      }
    } catch {
      if (mounted.current) {
        setData(null);
        setError(true);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const rootPath = data?.rootPath || paths.launcher;
  const total = data?.total ?? 0;
  const reclaimable = data?.reclaimable ?? 0;
  const cleanup = data?.cleanup;
  const busy = busyAction !== null;
  const locked = isRunning;

  const openFolder = () => {
    if (rootPath) void api.shell.openPath(rootPath);
  };

  const runAction = async (action: CleanupAction) => {
    setPendingAction(null);
    setBusyAction(action);
    try {
      const res =
        action === "cache"
          ? await api.storage.clearCache()
          : await api.storage.cleanup(action);
      if (res.blocked) {
        toast.error(t("settings.storage.busy"));
      } else if (res.failed) {
        toast.error(t("settings.storage.actionFailed"));
      } else {
        toast.success(
          t("settings.storage.cleared", {
            size: formatBytes(res.freed, sizes),
          }),
        );
      }
      await load();
    } catch {
      if (mounted.current) toast.error(t("settings.storage.actionFailed"));
    } finally {
      if (mounted.current) setBusyAction(null);
    }
  };

  const cleanupButton = (
    action: CleanupAction,
    Icon: LucideIcon,
    label: string,
    size: number,
  ) => (
    <Button
      key={action}
      variant="outline"
      size="sm"
      className="w-full justify-start"
      onClick={() => setPendingAction(action)}
      disabled={busy || locked}
    >
      {busyAction === action ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Icon className="size-4" />
      )}
      <span className="flex-1 text-left">{label}</span>
      <span className="tabular-nums text-muted-foreground">
        ~{formatBytes(size, sizes)}
      </span>
    </Button>
  );

  const confirmText: Record<
    CleanupAction,
    { title: string; body: string; confirm: string }
  > = {
    cache: {
      title: t("settings.storage.clearCacheConfirmTitle"),
      body: t("settings.storage.clearCacheConfirmBody"),
      confirm: t("settings.storage.clearCache"),
    },
    java: {
      title: t("settings.storage.cleanupJavaConfirmTitle"),
      body: t("settings.storage.cleanupJavaConfirmBody"),
      confirm: t("settings.storage.cleanupJava"),
    },
    libraries: {
      title: t("settings.storage.cleanupLibrariesConfirmTitle"),
      body: t("settings.storage.cleanupLibrariesConfirmBody"),
      confirm: t("settings.storage.cleanupLibraries"),
    },
  };

  const categories = data
    ? [...data.categories]
        .filter((c) => c.size > 0)
        .sort((a, b) => b.size - a.size)
    : [];
  const versions = data?.versions ?? [];
  const visibleVersions = showAllVersions
    ? versions
    : versions.slice(0, VERSION_LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {t("settings.storage.totalLabel")}
          </p>
          {loading ? (
            <Skeleton className="mt-1.5 h-8 w-28" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums">
              {error ? "—" : formatBytes(total, sizes)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => void load()}
            disabled={loading || busy}
            aria-label={t("settings.storage.refresh")}
            title={t("settings.storage.refresh")}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openFolder}
            disabled={!rootPath}
          >
            <FolderOpen className="size-4" />
            {t("settings.storage.openFolder")}
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-2.5 w-full rounded-full" />
      ) : error ? null : (
        <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-muted">
          {categories.map((c) => (
            <span
              key={c.id}
              className={cn("h-full", CATEGORY_META[c.id].color)}
              style={{ flexGrow: c.size }}
              title={`${t(`settings.storage.categories.${c.id}`)} — ${formatBytes(c.size, sizes)}`}
            />
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <AlertTriangle className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("settings.storage.loadError")}
          </p>
        </div>
      ) : total === 0 ? (
        <p className="py-2 text-center text-sm text-muted-foreground">
          {t("settings.storage.empty")}
        </p>
      ) : (
        <div className="space-y-0.5">
          {categories.map((c) => {
            const Icon = CATEGORY_META[c.id].icon;
            const percent = Math.round((c.size / total) * 100);
            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 py-1"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-[3px]",
                      CATEGORY_META[c.id].color,
                    )}
                  />
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {t(`settings.storage.categories.${c.id}`)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(`settings.storage.categoriesDesc.${c.id}`)}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm tabular-nums">
                    {formatBytes(c.size, sizes)}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {percent}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && versions.length > 0 && (
        <div className="space-y-1 border-t pt-3">
          <div className="flex items-baseline gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("settings.storage.byVersion")}
            </p>
            <span className="text-xs text-muted-foreground/70">
              {t("settings.storage.byVersionHint")}
            </span>
          </div>
          {visibleVersions.map((v) => (
            <div
              key={v.name}
              className="flex items-center justify-between gap-3 py-0.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Package className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">{v.name}</span>
              </div>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {formatBytes(v.size, sizes)}
              </span>
            </div>
          ))}
          {versions.length > VERSION_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllVersions((v) => !v)}
              className="pt-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {showAllVersions
                ? t("settings.storage.showLess")
                : t("settings.storage.showMore", {
                    count: versions.length - VERSION_LIMIT,
                  })}
            </button>
          )}
        </div>
      )}

      {!loading && total > 0 && (
        <div className="space-y-2 border-t pt-3">
          {locked && (
            <p className="text-xs text-muted-foreground">
              {t("settings.storage.busy")}
            </p>
          )}
          {reclaimable > 0 &&
            cleanupButton(
              "cache",
              Trash2,
              t("settings.storage.clearCache"),
              reclaimable,
            )}
          {cleanup && cleanup.java.count > 0
            ? cleanupButton(
                "java",
                Coffee,
                t("settings.storage.cleanupJava"),
                cleanup.java.size,
              )
            : null}
          {cleanup && cleanup.libraries.safe && cleanup.libraries.count > 0
            ? cleanupButton(
                "libraries",
                Library,
                t("settings.storage.cleanupLibraries"),
                cleanup.libraries.size,
              )
            : null}
        </div>
      )}

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          {pendingAction && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmText[pendingAction].title}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmText[pendingAction].body}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={() => void runAction(pendingAction)}
                >
                  <Trash2 className="size-4" />
                  {confirmText[pendingAction].confirm}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
