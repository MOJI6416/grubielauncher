import { IModpack } from "@/types/Backend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { accountAtom } from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import {
  Boxes,
  Copy,
  Download,
  ImageOff,
  Loader2,
  PackagePlus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddVersion } from "../Modals/Version/AddVersion";
import { Confirmation } from "../Modals/Confirmation";
import { toast } from "sonner";
import { buildPackShareUrl } from "@renderer/utilities/packShare";

const api = window.api;

export function OwnModpacks({
  _modpacks,
  onClose,
}: {
  _modpacks: IModpack[];
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<"deleting" | null>(null);
  const [account] = useAtom(accountAtom);

  const [modpacks, setModpacks] = useState(_modpacks);
  const [isAddVersion, setIsAddVersion] = useState(false);
  const [tempModpack, setTempModpack] = useState<IModpack | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);

  const { t } = useTranslation();

  useEffect(() => {
    setModpacks(_modpacks);
  }, [_modpacks]);

  const handleDelete = useCallback(async () => {
    if (isLoading || !account?.accessToken || !tempModpack) return;

    setIsLoading(true);
    setLoadingType("deleting");

    try {
      const result = await api.backend.deleteModpack(
        account.accessToken,
        tempModpack._id,
      );

      if (result) {
        toast.success(t("ownModpacks.deleted"));

        setModpacks((prev) => prev.filter((m) => m._id !== tempModpack._id));
        setTempModpack(null);
      } else {
        toast.error(t("ownModpacks.deleteError"));
      }
    } catch {
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  }, [tempModpack, isLoading, account?.accessToken, t]);

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !isLoading) onClose();
        }}
      >
        <DialogContent aria-describedby={undefined}
          data-account-click-ignore="true"
          className="sm:max-w-md"
          onPointerDownOutside={(event) => {
            if (isLoading || isAddVersion || isConfirmationOpen) {
              event.preventDefault();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (isLoading || isAddVersion || isConfirmationOpen) {
              event.preventDefault();
            }
          }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex min-w-0 items-center gap-2 pr-8">
              <DialogTitle className="flex items-center gap-2 pr-0">
                <Boxes className="size-5" />
                {t("ownModpacks.title")}
              </DialogTitle>
              {modpacks.length > 0 && (
                <Badge variant="outline" className="tabular-nums">
                  {modpacks.length}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[420px] pr-2">
            {modpacks.length === 0 ? (
              <Card className="border-dashed bg-card/70">
                <CardContent className="flex min-h-28 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {t("ownModpacks.noModpacks")}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-2">
                {modpacks.map((modpack) => (
                  <Card key={modpack._id} className="gap-0 py-0 shadow-none">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                        {modpack.conf.image ? (
                          <img
                            src={modpack.conf.image}
                            width={40}
                            height={40}
                            loading="lazy"
                            className="size-full object-cover"
                            alt={modpack.conf.name}
                          />
                        ) : (
                          <ImageOff className="size-4 text-muted-foreground" />
                        )}
                      </div>

                      <div className="grid min-w-0 flex-1 gap-1">
                        <p
                          className="truncate text-sm font-medium"
                          title={modpack.conf.name}
                        >
                          {modpack.conf.name}
                        </p>
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge variant="outline" className="h-5 gap-1 px-1.5">
                            <Download className="size-3" />
                            <span className="tabular-nums">
                              {modpack.downloads}
                            </span>
                          </Badge>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={isLoading}
                          title={t("ownModpacks.copyId")}
                          aria-label={t("ownModpacks.copyId")}
                          onClick={async () => {
                            await api.clipboard.writeText(
                              buildPackShareUrl(modpack._id),
                            );
                            toast(t("common.copied"));
                          }}
                        >
                          <Copy />
                        </Button>

                        <Button
                          size="icon-sm"
                          disabled={isLoading}
                          title={t("ownModpacks.addToLauncher")}
                          aria-label={t("ownModpacks.addToLauncher")}
                          onClick={() => {
                            setTempModpack(modpack);
                            setIsAddVersion(true);
                          }}
                        >
                          <PackagePlus />
                        </Button>

                        <Button
                          variant="destructive"
                          size="icon-sm"
                          disabled={isLoading}
                          title={t("common.delete")}
                          aria-label={t("common.delete")}
                          onClick={() => {
                            setTempModpack(modpack);
                            setIsConfirmationOpen(true);
                          }}
                        >
                          {isLoading &&
                          loadingType === "deleting" &&
                          tempModpack?._id === modpack._id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {isAddVersion && tempModpack && (
        <AddVersion
          closeModal={() => setIsAddVersion(false)}
          modpack={tempModpack}
        />
      )}

      {isConfirmationOpen && tempModpack && (
        <Confirmation
          content={[
            {
              text: t("ownModpacks.confirmation", {
                name: tempModpack.conf.name,
              }),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              loading: isLoading && loadingType === "deleting",
              onClick: async () => {
                await handleDelete();
                setIsConfirmationOpen(false);
              },
            },
            {
              text: t("common.no"),
              color: "default",
              onClick: () => setIsConfirmationOpen(false),
            },
          ]}
          onClose={() => setIsConfirmationOpen(false)}
        />
      )}
    </>
  );
}
