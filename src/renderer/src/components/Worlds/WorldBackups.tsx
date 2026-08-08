import { IWorld } from "@/types/World";
import {
  IWorldBackup,
  IWorldPreservedCopy,
  WorldBackupErrorCode,
  WorldBackupTrigger,
  normalizeWorldBackupKeep,
} from "@/types/WorldBackup";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Archive,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  Plus,
  Trash,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { isRunningAtom, settingsAtom } from "@renderer/stores/atoms";
import { toast } from "sonner";
import { formatDate } from "@renderer/utilities/date";
import { formatBytes } from "@renderer/utilities/file";
import { showFailureToast } from "@renderer/utilities/failures";
import { Confirmation } from "../Modals/Confirmation";

const api = window.api;

const TRIGGER_VARIANT: Record<
  WorldBackupTrigger,
  "secondary" | "outline" | "default"
> = {
  manual: "secondary",
  auto: "outline",
  preRestore: "outline",
};

export function WorldBackups({
  world,
  onClose,
  onRestored,
}: {
  world: IWorld;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { t } = useTranslation();
  const [settings] = useAtom(settingsAtom);
  const [isRunning] = useAtom(isRunningAtom);

  const [backups, setBackups] = useState<IWorldBackup[]>([]);
  const [skipReason, setSkipReason] = useState<WorldBackupErrorCode | null>(
    null,
  );
  const [preserved, setPreserved] = useState<IWorldPreservedCopy[]>([]);
  const [pendingPreserved, setPendingPreserved] =
    useState<IWorldPreservedCopy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<IWorldBackup | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<IWorldBackup | null>(null);

  const keep = normalizeWorldBackupKeep(settings.worldBackupKeep);
  const isBusy = isCreating || busyId !== null;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const sizes = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];

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
    setIsCreating(true);

    try {
      const result = await api.worlds.createBackup(world.path, keep);

      if (result?.ok) {
        toast.success(t("worldBackups.created"));
      } else {
        reportError(result?.error ?? "failed", t("worldBackups.createError"));
      }
    } catch (error) {
      showFailureToast(t("worldBackups.createError"), error, {
        fallbackDescription: t("worldBackups.errors.failed"),
      });
    } finally {
      await load();
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
        const preservedPath = result.preservedPath;

        if (preservedPath) {
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

        onRestored();
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

  const handleDeletePreserved = async (copy: IWorldPreservedCopy) => {
    setBusyId(copy.path);

    try {
      const result = await api.worlds.deletePreserved(copy.path);

      if (result?.ok) {
        toast.success(t("worldBackups.preservedDeleted"));
      } else {
        reportError(result?.error ?? "failed", t("worldBackups.deleteError"));
      }
    } catch (error) {
      showFailureToast(t("worldBackups.deleteError"), error, {
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

      if (result?.ok) {
        toast.success(t("worldBackups.deleted"));
      } else {
        reportError(result?.error ?? "failed", t("worldBackups.deleteError"));
      }
    } catch (error) {
      showFailureToast(t("worldBackups.deleteError"), error, {
        fallbackDescription: t("worldBackups.errors.failed"),
      });
    } finally {
      await load();
      if (mounted.current) setBusyId(null);
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !isBusy) onClose();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          onPointerDownOutside={(event) => {
            if (isBusy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isBusy) event.preventDefault();
          }}
          className="flex max-h-[88vh] flex-col gap-4 overflow-hidden sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
                <Archive className="size-4" />
              </span>
              <span className="grid min-w-0 gap-0.5 text-left">
                <span className="truncate">{t("worldBackups.title")}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {world.name}
                </span>
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
            <p className="min-w-0 text-xs text-muted-foreground">
              {settings.autoWorldBackup
                ? t("worldBackups.autoOn", { keep })
                : t("worldBackups.autoOff")}
            </p>
            <Button
              size="sm"
              className="shrink-0"
              disabled={isBusy || isRunning}
              title={
                isRunning ? t("worldBackups.errors.versionRunning") : undefined
              }
              onClick={handleCreate}
            >
              {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
              {t("worldBackups.create")}
            </Button>
          </div>

          {skipReason && settings.autoWorldBackup && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>
                {t(`worldBackups.errors.${skipReason}`)}
              </AlertDescription>
            </Alert>
          )}

          {isBusy && (
            <p className="text-center text-xs text-muted-foreground">
              {t("worldBackups.longOperation")}
            </p>
          )}

          {isLoading ? (
            <div className="flex h-56 items-center justify-center">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : (
            <ScrollArea className="-mr-3 max-h-[24rem] min-h-0 w-full">
              <div className="flex min-w-0 flex-col gap-2 pr-3">
                {backups.length === 0 && (
                  <Empty className="min-h-56 border border-dashed bg-muted/20">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Archive />
                      </EmptyMedia>
                      <EmptyTitle>{t("worldBackups.empty")}</EmptyTitle>
                      <EmptyDescription>
                        {t("worldBackups.emptyHint")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}

                {backups.map((backup) => (
                  <Card
                    key={backup.id}
                    className="gap-0 overflow-hidden py-0 shadow-none transition-colors hover:bg-accent/25"
                  >
                    <CardContent className="p-3">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <div className="grid min-w-0 gap-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {backup.createdAt
                                ? formatDate(new Date(backup.createdAt))
                                : t("worldBackups.unknownDate")}
                            </p>
                            <Badge
                              variant={TRIGGER_VARIANT[backup.trigger]}
                              className="shrink-0"
                            >
                              {t(`worldBackups.triggers.${backup.trigger}`)}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatBytes(backup.size, sizes)}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy || isRunning}
                            title={
                              isRunning
                                ? t("worldBackups.errors.versionRunning")
                                : undefined
                            }
                            onClick={() => setPendingRestore(backup)}
                          >
                            {busyId === backup.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <HardDriveDownload />
                            )}
                            {t("worldBackups.restore")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={isBusy}
                            aria-label={t("common.delete")}
                            onClick={() => setPendingDelete(backup)}
                          >
                            {busyId === backup.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Trash />
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {preserved.length > 0 && (
                  <div className="mt-1 grid gap-2 border-t pt-3">
                    <div className="grid gap-0.5">
                      <p className="text-sm font-medium">
                        {t("worldBackups.preservedTitle")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("worldBackups.preservedHint")}
                      </p>
                    </div>

                    {preserved.map((copy) => (
                      <div
                        key={copy.path}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2"
                      >
                        <div className="grid min-w-0 gap-0.5">
                          <p className="truncate text-xs font-medium">
                            {copy.createdAt
                              ? formatDate(new Date(copy.createdAt))
                              : t("worldBackups.unknownDate")}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatBytes(copy.size, sizes)}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void api.shell.openPath(copy.path)}
                          >
                            <FolderOpen />
                            {t("worlds.openFolder")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={isBusy}
                            aria-label={t("common.delete")}
                            onClick={() => setPendingPreserved(copy)}
                          >
                            {busyId === copy.path ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Trash />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {pendingRestore && (
        <Confirmation
          content={[
            { text: t("worldBackups.restoreConfirm"), color: "warning" },
            { text: t("worldBackups.restoreConfirmSafety"), color: "default" },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              onClick: async () => {
                const target = pendingRestore;
                setPendingRestore(null);
                await handleRestore(target);
              },
            },
            {
              text: t("common.no"),
              color: "default",
              onClick: () => setPendingRestore(null),
            },
          ]}
          onClose={() => setPendingRestore(null)}
        />
      )}

      {pendingPreserved && (
        <Confirmation
          content={[
            { text: t("worldBackups.preservedDeleteConfirm"), color: "warning" },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              onClick: async () => {
                const target = pendingPreserved;
                setPendingPreserved(null);
                await handleDeletePreserved(target);
              },
            },
            {
              text: t("common.no"),
              color: "default",
              onClick: () => setPendingPreserved(null),
            },
          ]}
          onClose={() => setPendingPreserved(null)}
        />
      )}

      {pendingDelete && (
        <Confirmation
          content={[
            { text: t("worldBackups.deleteConfirm"), color: "warning" },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              onClick: async () => {
                const target = pendingDelete;
                setPendingDelete(null);
                await handleDelete(target);
              },
            },
            {
              text: t("common.no"),
              color: "default",
              onClick: () => setPendingDelete(null),
            },
          ]}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
