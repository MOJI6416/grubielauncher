import { VERSION_DELETE_BUSY } from "@/types/IVersion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  accountAtom,
  authDataAtom,
  consolesAtom,
  networkAtom,
  selectedVersionAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { useAtom, useSetAtom } from "jotai";
import {
  ArrowLeft,
  Globe2,
  HardDrive,
  Loader2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showFailureToast } from "@renderer/utilities/failures";
import { formatBytes } from "@renderer/utilities/file";
import {
  useInstanceContents,
  useInstanceDiskUsage,
} from "@renderer/features/instances/useInstanceInsights";
import { getDeleteGates } from "@renderer/features/instances/deleteGates";
import { clearInstanceSelection } from "@renderer/features/instances/selectInstance";
import { forgetContinueCache } from "@renderer/features/instances/continueCache";
import { updateInstancesFile } from "@renderer/features/instances/instancesStore";
import { forgetInstanceKey } from "@/shared/instancesFile";
import { forgetUpdateCache } from "@renderer/features/mods/useUpdateCheck";
import { forgetInstanceUpdates } from "@renderer/features/instances/updateCheck";
import { forgetInstance } from "@renderer/navigation/navigate";
const api = window.api;

export function DeleteVersion({
  close,
}: {
  close: (isDeleted?: boolean) => void;
}) {
  const [version] = useAtom(selectedVersionAtom);
  const [isLoading, setIsLoading] = useState(false);
  const { size, isUnknown: isSizeUnknown } = useInstanceDiskUsage(
    version?.versionPath,
  );
  const contents = useInstanceContents(version?.versionPath);
  const { t } = useTranslation();

  const [fullDel, setFullDel] = useState(false);
  const [shareDel, setShareDel] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const runningRef = useRef(false);

  const [account] = useAtom(accountAtom);
  const setVersions = useSetAtom(versionsAtom);
  const [isNetwork] = useAtom(networkAtom);
  const [authData] = useAtom(authDataAtom);
  const setConsoles = useSetAtom(consolesAtom);

  const canRequestRemoteDelete =
    isNetwork && !!authData && !!account?.accessToken;

  const { publicationOwner, canOfferRemoteDelete, canDeleteRemote } = useMemo(
    () =>
      getDeleteGates({
        shareCode: version?.version.shareCode,
        downloadedVersion: version?.version.downloadedVersion,
        owner: version?.version.owner,
        ownerId: version?.version.ownerId,
        account,
        shareDel,
        canRequestRemoteDelete,
      }),
    [version, account, shareDel, canRequestRemoteDelete],
  );

  const versionName = version?.version.name || "";

  const versionKey = useMemo(() => {
    if (!version) return null;
    return {
      name: version.version.name,
      path: version.versionPath,
    };
  }, [version]);

  async function handleDelete() {
    if (!version || !account || !versionKey || runningRef.current) return;

    runningRef.current = true;
    setIsLoading(true);

    try {
      if (canDeleteRemote && version.version.shareCode) {
        const token = account.accessToken || "";
        const isRemoteDeleted = await api.backend.deleteModpack(
          token,
          version.version.shareCode,
        );

        if (!isRemoteDeleted) {
          showFailureToast(t("versions.deleteError"), undefined, {
            channels: ["backend:deleteModpack"],
            fallbackDescription: t("versions.deleteRemoteErrorHint"),
          });
          return;
        }
      }

      setConsoles((prev) => ({
        consoles: prev.consoles.filter(
          (c) => c.versionName !== version.version.name,
        ),
      }));

      const result = await version.delete(account, fullDel);

      const key = versionKey.path || versionKey.name;

      forgetContinueCache(versionKey.path);
      forgetUpdateCache();
      forgetInstanceUpdates(key);
      forgetInstance(key);
      clearInstanceSelection();

      updateInstancesFile((file) => forgetInstanceKey(file, key));

      setVersions((prev) =>
        prev.filter((v) => {
          if (versionKey.path && v.versionPath) {
            return v.versionPath !== versionKey.path;
          }

          return v.version.name !== versionKey.name;
        }),
      );

      toast.success(
        result.trashed ? t("versions.trashed") : t("versions.deleted"),
        {
          description: result.trashed
            ? t("versions.trashedHint")
            : t("versions.deletedHint"),
        },
      );

      close(true);
    } catch (error) {
      console.error(error);

      const isBusy =
        error instanceof Error && error.message === VERSION_DELETE_BUSY;

      showFailureToast(t("versions.deleteError"), error, {
        fallbackDescription: isBusy
          ? t("versions.deleteBusyHint")
          : t("versions.deleteErrorHint"),
      });
    } finally {
      runningRef.current = false;
      setIsLoading(false);
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !isLoading) close();
      }}
    >
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("common.deletion")}</DialogTitle>
          <DialogDescription>{t("versions.savesInfo")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="min-w-0 rounded-md border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {t("versions.version")}
            </p>
            <p className="truncate text-sm font-medium">{versionName}</p>

            <div className="mt-2 flex items-center gap-4 border-t pt-2 text-[0.7rem] text-faint">
              <span className="flex items-center gap-1.5">
                <HardDrive className="size-3 shrink-0" />
                <span className="font-mono tabular-nums">
                  {isSizeUnknown
                    ? "?"
                    : size === null
                      ? "…"
                      : formatBytes(
                          size,
                          [
                            t("sizes.0"),
                            t("sizes.1"),
                            t("sizes.2"),
                            t("sizes.3"),
                            t("sizes.4"),
                          ],
                          1,
                        )}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Globe2 className="size-3 shrink-0" />
                <span>
                  {t("shell.tabs.worlds")}
                  <span className="ml-1 font-mono tabular-nums">
                    {!contents.ready
                      ? "…"
                      : contents.savesUnknown
                        ? "?"
                        : contents.worlds}
                  </span>
                </span>
              </span>
            </div>
          </div>

          {(contents.savesUnknown || contents.worlds > 0) && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              {contents.savesUnknown
                ? t("versions.worldsUnknownHint")
                : t("versions.worldsLostHint", { count: contents.worlds })}
            </p>
          )}

          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent/40 has-disabled:cursor-not-allowed has-disabled:opacity-60">
              <Checkbox
                className="mt-0.5"
                disabled={isLoading}
                checked={fullDel}
                onCheckedChange={(checked) => setFullDel(checked === true)}
              />
              <span className="grid min-w-0 gap-1">
                <span className="font-medium leading-none">
                  {t("versions.completeRemoval")}
                </span>
                <span className="text-xs leading-5 text-muted-foreground">
                  {t("versions.completeRemovalInfo")}
                </span>
              </span>
            </label>

            {canOfferRemoteDelete && (
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent/40 has-disabled:cursor-not-allowed has-disabled:opacity-60",
                  !canRequestRemoteDelete && "cursor-not-allowed opacity-60",
                )}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={shareDel && canRequestRemoteDelete}
                  disabled={isLoading || !canRequestRemoteDelete}
                  onCheckedChange={(checked) => setShareDel(checked === true)}
                />
                <span className="grid gap-1">
                  <span className="font-medium">
                    {t("versions.versionShareDel")}
                  </span>
                  <span className="text-xs leading-5 text-muted-foreground">
                    {t("versions.hostInfo")}
                  </span>
                </span>
              </label>
            )}

            {canOfferRemoteDelete && !!account && !canRequestRemoteDelete && (
              <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                {t("versions.deleteBlocked.remoteUnavailable")}
              </p>
            )}

            {publicationOwner && (
              <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                {t("versions.deleteBlocked.notOwner", {
                  nickname: publicationOwner.nickname,
                })}
              </p>
            )}
          </div>

          {!account && (
            <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {t("versions.deleteBlocked.noAccount")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            ref={cancelRef}
            variant="secondary"
            disabled={isLoading}
            onClick={() => close()}
          >
            <ArrowLeft />
            {t("versions.willReturn")}
          </Button>

          <Button
            variant="destructive"
            disabled={
              isLoading ||
              !contents.ready ||
              !version ||
              !account ||
              !versionKey
            }
            onClick={handleDelete}
          >
            {isLoading || !contents.ready ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Trash2 />
            )}
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
