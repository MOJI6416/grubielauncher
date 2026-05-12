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
import { useAtom } from "jotai";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const api = window.api;

export function DeleteVersion({
  close,
}: {
  close: (isDeleted?: boolean) => void;
}) {
  const [version] = useAtom(selectedVersionAtom);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const [fullDel, setFullDel] = useState(false);
  const [shareDel, setShareDel] = useState(true);

  const [account] = useAtom(accountAtom);
  const [, setVersions] = useAtom(versionsAtom);
  const [isNetwork] = useAtom(networkAtom);
  const [authData] = useAtom(authDataAtom);
  const [, setConsoles] = useAtom(consolesAtom);

  const canOfferRemoteDelete = useMemo(() => {
    return !!version?.version.shareCode && !version.version.downloadedVersion;
  }, [version]);

  const canDeleteRemote = useMemo(() => {
    return (
      !!version?.version.shareCode &&
      !version.version.downloadedVersion &&
      shareDel &&
      isNetwork &&
      !!authData &&
      !!account?.accessToken
    );
  }, [version, shareDel, isNetwork, authData, account?.accessToken]);

  const versionName = version?.version.name || "";

  const versionKey = useMemo(() => {
    if (!version) return null;
    return {
      name: version.version.name,
      path: version.versionPath,
    };
  }, [version]);

  async function handleDelete() {
    if (!version || !account || !versionKey) return;

    setIsLoading(true);

    try {
      if (canDeleteRemote && version.version.shareCode) {
        const token = account.accessToken || "";
        const isRemoteDeleted = await api.backend.deleteModpack(
          token,
          version.version.shareCode,
        );

        if (!isRemoteDeleted) throw new Error("Remote deletion failed");
      }

      setConsoles((prev) => ({
        consoles: prev.consoles.filter(
          (c) => c.versionName !== version.version.name,
        ),
      }));

      await version.delete(account, fullDel);

      setVersions((prev) =>
        prev.filter((v) => {
          if (versionKey.path && v.versionPath) {
            return v.versionPath !== versionKey.path;
          }

          return v.version.name !== versionKey.name;
        }),
      );

      toast.success(t("versions.deleted"));

      close(true);
    } catch (error) {
      console.error(error);
      toast.error(t("versions.deleteError"));
    } finally {
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
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("common.deletion")}</DialogTitle>
          <DialogDescription>
            {t("versions.savesInfo")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="min-w-0 rounded-md border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {t("versions.version")}
            </p>
            <p className="truncate text-sm font-medium">{versionName}</p>
          </div>

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
                <span
                  className="text-xs leading-5 text-muted-foreground"
                >
                  {t("versions.completeRemovalInfo")}
                </span>
              </span>
            </label>

            {canOfferRemoteDelete && (
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent/40 has-disabled:cursor-not-allowed has-disabled:opacity-60",
                  !isNetwork && "cursor-not-allowed opacity-60",
                )}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={shareDel && isNetwork}
                  disabled={isLoading || !isNetwork}
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
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            disabled={isLoading}
            onClick={() => close()}
          >
            <ArrowLeft />
            {t("versions.willReturn")}
          </Button>

          <Button
            variant="destructive"
            disabled={isLoading || !version || !account || !versionKey}
            onClick={handleDelete}
          >
            {isLoading ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
