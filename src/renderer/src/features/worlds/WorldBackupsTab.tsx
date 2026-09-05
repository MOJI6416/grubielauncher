import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Archive,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  Plus,
  Trash,
  TriangleAlert,
} from "lucide-react";
import { IWorld } from "@/types/World";
import {
  IWorldBackup,
  IWorldPreservedCopy,
  WorldBackupErrorCode,
  WorldBackupTrigger,
  normalizeWorldBackupKeep,
} from "@/types/WorldBackup";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { Hint } from "@renderer/components/Hint";
import { settingsAtom } from "@renderer/stores/atoms";
import {
  formatDate,
  formatRelative,
  formatTime,
} from "@renderer/utilities/date";
import { formatBytes } from "@renderer/utilities/file";
import { holdBusy } from "@renderer/utilities/busy";
import { showFailureToast } from "@renderer/utilities/failures";
import { toast } from "sonner";
import { backupFreshness } from "./worldFacts";

const api = window.api;

const TRIGGER_TONE: Record<WorldBackupTrigger, string> = {
  manual: "bg-primary-soft-raised text-foreground",
  auto: "bg-surface-3 text-muted-foreground",
  preRestore: "bg-warning/15 text-warning",
  preEdit: "bg-warning/15 text-warning",
};

export function WorldBackupsTab({
  world,
  isVersionRunning,
  onChanged,
}: {
  world: IWorld;
  isVersionRunning: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);

  const [backups, setBackups] = useState<IWorldBackup[]>([]);
  const [preserved, setPreserved] = useState<IWorldPreservedCopy[]>([]);
  const [skipReason, setSkipReason] = useState<WorldBackupErrorCode | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<IWorldBackup | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<IWorldBackup | null>(null);
  const [pendingPreserved, setPendingPreserved] =
    useState<IWorldPreservedCopy | null>(null);

  const keep = normalizeWorldBackupKeep(settings.worldBackupKeep);
  const isBusy = isCreating || busyId !== null;

  const creatingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const sizeLabels = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];

  const timeLabels = { h: t("time.h"), m: t("time.m"), s: t("time.s") };

  const load = useCallback(async () => {
    try {
      const result = await api.worlds.listBackups(world.path);
      if (!mounted.current) return;

      setBackups(result?.backups ?? []);
      setSkipReason(result?.skipReason ?? null);
      setPreserved(result?.preserved ?? []);
    } catch (error) {
      console.error(error);
      if (!mounted.current) return;

      setBackups([]);
      setSkipReason(null);
      setPreserved([]);
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, [world.path]);

  useEffect(() => {
    setIsLoading(true);
    void load();
  }, [load]);

  const reportError = (code: WorldBackupErrorCode, title: string) => {
    showFailureToast(title, undefined, {
      channels: ["worlds:"],
      fallbackDescription: t(`worldBackups.errors.${code}`),
    });
  };

  const handleCreate = async () => {
    if (creatingRef.current) return;

    creatingRef.current = true;
    const startedAt = Date.now();
    setIsCreating(true);

    try {
      const result = await api.worlds.createBackup(world.path, keep);

      if (result?.ok) toast.success(t("worldBackups.created"));
      else
        reportError(result?.error ?? "failed", t("worldBackups.createError"));
    } catch (error) {
      showFailureToast(t("worldBackups.createError"), error, {
        fallbackDescription: t("worldBackups.errors.failed"),
      });
    } finally {
      await load();
      onChanged();
      await holdBusy(startedAt);
      creatingRef.current = false;
      if (mounted.current) setIsCreating(false);
    }
  };

  const handleRestore = async (backup: IWorldBackup) => {
    setBusyId(backup.id);

    try {
      const result = await api.worlds.restoreBackup(
        backup.id,
        world.path,
        keep,
      );

      if (result?.ok) {
        if (result.preservedPath) {
          const preservedPath = result.preservedPath;
          toast.warning(t("worldBackups.restoredNoSafety"), {
            description: t("worldBackups.restoredNoSafetyHint"),
            duration: 15000,
            action: {
              label: t("worlds.openFolder"),
              onClick: () => void api.shell.openPath(preservedPath),
            },
          });
        } else {
          toast.success(t("worldBackups.restored"), {
            description: result.safetyBackupId
              ? t("worldBackups.restoredSafety")
              : undefined,
          });
        }

        onChanged();
      } else {
        reportError(result?.error ?? "failed", t("worldBackups.restoreError"));
      }
    } catch (error) {
      showFailureToast(t("worldBackups.restoreError"), error, {
        fallbackDescription: t("worldBackups.errors.failed"),
      });
    } finally {
      await load();
      if (mounted.current) setBusyId(null);
    }
  };

  const handleDelete = async (backup: IWorldBackup) => {
    setBusyId(backup.id);

    try {
      const result = await api.worlds.deleteBackup(backup.id);

      if (result?.ok) toast.success(t("worldBackups.deleted"));
      else
        reportError(result?.error ?? "failed", t("worldBackups.deleteError"));
    } catch (error) {
      showFailureToast(t("worldBackups.deleteError"), error, {
        fallbackDescription: t("worldBackups.errors.failed"),
      });
    } finally {
      await load();
      onChanged();
      if (mounted.current) setBusyId(null);
    }
  };

  const handleDeletePreserved = async (copy: IWorldPreservedCopy) => {
    setBusyId(copy.path);

    try {
      const result = await api.worlds.deletePreserved(copy.path);

      if (result?.ok) toast.success(t("worldBackups.preservedDeleted"));
      else
        reportError(result?.error ?? "failed", t("worldBackups.deleteError"));
    } catch (error) {
      showFailureToast(t("worldBackups.deleteError"), error, {
        fallbackDescription: t("worldBackups.errors.failed"),
      });
    } finally {
      await load();
      if (mounted.current) setBusyId(null);
    }
  };

  const freshnessLabel = (backup: IWorldBackup) => {
    const freshness = backupFreshness(backup.createdAt, world.lastPlayed);
    if (!freshness) return null;

    if (!freshness.losesProgress) {
      return {
        text: t("worldBackups.coversLastSession"),
        tone: "text-success",
      };
    }

    return {
      text: t("worldBackups.behindWorld", {
        time: formatTime(Math.floor(freshness.deltaMs / 1000), timeLabels),
      }),
      tone: "text-warning",
    };
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl border bg-surface-1 px-3 py-2">
          <p className="min-w-0 text-xs text-muted-foreground">
            {settings.autoWorldBackup
              ? t("worldBackups.autoOn", { keep })
              : t("worldBackups.autoOff")}
          </p>

          <Hint
            content={
              isVersionRunning
                ? t("worldBackups.errors.versionRunning")
                : undefined
            }
          >
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-xs"
              disabled={isBusy || isVersionRunning}
              onClick={() => void handleCreate()}
            >
              {isCreating ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              {t("worldBackups.create")}
            </Button>
          </Hint>
        </div>

        {skipReason && settings.autoWorldBackup && (
          <Alert variant="destructive" className="shrink-0">
            <TriangleAlert />
            <AlertDescription>
              {t(`worldBackups.errors.${skipReason}`)}
            </AlertDescription>
          </Alert>
        )}

        {isBusy && (
          <p className="shrink-0 text-center text-xs text-muted-foreground">
            {t("worldBackups.longOperation")}
          </p>
        )}

        {isLoading ? (
          <div
            aria-busy
            className="flex min-h-0 flex-1 flex-col rounded-xl border bg-surface-1"
          >
            <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
              <Skeleton className="h-2.5 w-24 rounded" />
              <Skeleton className="h-2.5 w-12 rounded" />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="flex shrink-0 items-center gap-3 px-1.5 py-1.5"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-28 rounded" />
                      <Skeleton className="h-3.5 w-14 rounded" />
                      <Skeleton className="h-3 w-10 rounded" />
                    </div>
                    <Skeleton className="h-2.5 w-36 rounded" />
                  </div>
                  <Skeleton className="h-7 w-24 shrink-0 rounded-lg" />
                  <Skeleton className="size-7 shrink-0 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ) : backups.length === 0 && preserved.length === 0 ? (
          <Empty className="min-h-0 flex-1 border border-dashed border-border bg-surface-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Archive />
              </EmptyMedia>
              <EmptyTitle>{t("worldBackups.empty")}</EmptyTitle>
              <EmptyDescription>{t("worldBackups.emptyHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-surface-1">
            <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
              <span>{t("worldBackups.stored")}</span>
              <span className="font-mono text-faint">
                {formatBytes(
                  backups.reduce((sum, entry) => sum + entry.size, 0),
                  sizeLabels,
                  1,
                )}
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
              {backups.map((backup) => {
                const freshness = freshnessLabel(backup);

                return (
                  <div
                    key={backup.id}
                    className="flex min-w-0 items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Hint
                          variant="text"
                          content={
                            backup.createdAt
                              ? formatDate(new Date(backup.createdAt))
                              : undefined
                          }
                        >
                          <span className="truncate text-xs font-medium">
                            {backup.createdAt
                              ? formatRelative(new Date(backup.createdAt))
                              : t("worldBackups.unknownDate")}
                          </span>
                        </Hint>

                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] ${TRIGGER_TONE[backup.trigger]}`}
                        >
                          {t(`worldBackups.triggers.${backup.trigger}`)}
                        </span>

                        <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                          {formatBytes(backup.size, sizeLabels, 1)}
                        </span>
                      </div>

                      {freshness && (
                        <span
                          className={`truncate text-[0.65rem] ${freshness.tone}`}
                        >
                          {freshness.text}
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Hint
                        content={
                          isVersionRunning
                            ? t("worldBackups.errors.versionRunning")
                            : undefined
                        }
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={isBusy || isVersionRunning}
                          onClick={() => setPendingRestore(backup)}
                        >
                          {busyId === backup.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <HardDriveDownload className="size-3.5" />
                          )}
                          {t("worldBackups.restore")}
                        </Button>
                      </Hint>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        disabled={isBusy}
                        aria-label={t("common.delete")}
                        onClick={() => setPendingDelete(backup)}
                      >
                        <Trash className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {preserved.length > 0 && (
                <div className="mt-1 flex flex-col gap-1.5 border-t pt-2.5">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-medium">
                      {t("worldBackups.preservedTitle")}
                    </p>
                    <p className="text-[0.65rem] text-muted-foreground">
                      {t("worldBackups.preservedHint")}
                    </p>
                  </div>

                  {preserved.map((copy) => (
                    <div
                      key={copy.path}
                      className="flex min-w-0 items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-accent/30"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate text-xs">
                          {copy.createdAt
                            ? formatDate(new Date(copy.createdAt))
                            : t("worldBackups.unknownDate")}
                        </span>
                        <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                          {formatBytes(copy.size, sizeLabels, 1)}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={isBusy}
                          onClick={() => void api.shell.openPath(copy.path)}
                        >
                          <FolderOpen className="size-3.5" />
                          {t("worlds.openFolder")}
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          disabled={isBusy}
                          aria-label={t("common.delete")}
                          onClick={() => setPendingPreserved(copy)}
                        >
                          {busyId === copy.path ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Trash className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {pendingRestore && (
        <Confirmation
          title={t("worldBackups.restoreTitle")}
          reversible
          content={[
            {
              text: t("worldBackups.restoreConfirmDated", {
                date: pendingRestore.createdAt
                  ? formatDate(new Date(pendingRestore.createdAt))
                  : t("worldBackups.unknownDate"),
              }),
              color: "warning",
            },
            ...(freshnessLabel(pendingRestore)
              ? [
                  {
                    text: freshnessLabel(pendingRestore)!.text,
                    color: "default" as const,
                  },
                ]
              : []),
            { text: t("worldBackups.restoreConfirmSafety"), color: "default" },
          ]}
          buttons={[
            {
              text: t("worldBackups.restore"),
              color: "danger",
              onClick: async () => {
                const target = pendingRestore;
                setPendingRestore(null);
                await handleRestore(target);
              },
            },
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingRestore(null),
            },
          ]}
          onClose={() => setPendingRestore(null)}
        />
      )}

      {pendingDelete && (
        <Confirmation
          title={t("worldBackups.deleteTitle")}
          reversible={false}
          content={[
            {
              text: t("worldBackups.deleteConfirmDated", {
                date: pendingDelete.createdAt
                  ? formatDate(new Date(pendingDelete.createdAt))
                  : t("worldBackups.unknownDate"),
              }),
            },
          ]}
          buttons={[
            {
              text: t("common.delete"),
              color: "danger",
              onClick: async () => {
                const target = pendingDelete;
                setPendingDelete(null);
                await handleDelete(target);
              },
            },
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingDelete(null),
            },
          ]}
          onClose={() => setPendingDelete(null)}
        />
      )}

      {pendingPreserved && (
        <Confirmation
          title={t("worldBackups.preservedDeleteTitle")}
          reversible={false}
          content={[{ text: t("worldBackups.preservedDeleteConfirm") }]}
          buttons={[
            {
              text: t("common.delete"),
              color: "danger",
              onClick: async () => {
                const target = pendingPreserved;
                setPendingPreserved(null);
                await handleDeletePreserved(target);
              },
            },
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingPreserved(null),
            },
          ]}
          onClose={() => setPendingPreserved(null)}
        />
      )}
    </>
  );
}
