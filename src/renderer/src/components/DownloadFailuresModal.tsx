import { DownloaderFailuresInfo } from "@/types/Downloader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, FileWarning } from "lucide-react";
import { useTranslation } from "react-i18next";

export function DownloadFailuresModal({
  info,
  onClose,
}: {
  info: DownloaderFailuresInfo;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b bg-muted/20 px-5 py-4 text-left">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/20 text-destructive">
              <FileWarning className="size-4" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <DialogTitle className="truncate text-base">
                {t("downloadFailures.title")}
              </DialogTitle>
              <DialogDescription className="truncate">
                {t("downloadFailures.completed")}: {info.completedItems}/
                {info.totalItems}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-3 px-5">
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>
              {t("downloadFailures.description")}
            </AlertDescription>
          </Alert>

          <ScrollArea className="max-h-[320px] pr-3">
            <div className="grid gap-2">
              {info.failures.map((failure, index) => (
                <article
                  key={`${failure.destination}-${failure.url}-${index}`}
                  className="min-w-0 rounded-lg border bg-muted/15 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium">
                        {failure.fileName}
                      </h3>
                      <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                        {failure.error}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="max-w-28 shrink-0 truncate bg-muted/30"
                    >
                      {failure.group}
                    </Badge>
                  </div>
                </article>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="m-0 rounded-none border-t bg-muted/25 px-5 py-4">
          <Button variant="secondary" className="min-w-24" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
