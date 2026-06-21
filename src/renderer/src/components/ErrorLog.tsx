import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { errorLogAtom } from "@renderer/stores/atoms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { BellOff } from "lucide-react";

const api = window.api;

export function ErrorLog({ onClose }: { onClose: () => void }) {
  const [errorLog, setErrorLog] = useAtom(errorLogAtom);
  const { t, i18n } = useTranslation();

  const formatTime = (time: number) =>
    new Date(time).toLocaleString(i18n.language, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} className="p-0 sm:max-w-lg">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>{t("errorLog.title")}</DialogTitle>
        </DialogHeader>

        <div className="px-5">
          {errorLog.length === 0 ? (
            <Empty className="border bg-muted/20 py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BellOff />
                </EmptyMedia>
                <EmptyTitle>{t("errorLog.empty")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <ScrollArea className="max-h-[50vh]">
              <div className="flex flex-col gap-2 pr-2">
                {errorLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border bg-card p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{entry.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatTime(entry.time)}
                        </p>
                      </div>
                      {entry.details && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0"
                          title={t("common.copy")}
                          aria-label={t("common.copy")}
                          onClick={async () => {
                            await api.clipboard.writeText(
                              `${entry.title}\n${entry.details}`,
                            );
                            toast(t("common.copied"));
                          }}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      )}
                    </div>
                    {entry.details && (
                      <p className="mt-1.5 text-xs break-words text-muted-foreground">
                        {entry.details}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="m-0 rounded-none border-t bg-muted/25 px-5 py-4">
          <Button
            variant="outline"
            disabled={errorLog.length === 0}
            onClick={() => setErrorLog([])}
          >
            <Trash2 className="size-4" />
            {t("errorLog.clear")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
