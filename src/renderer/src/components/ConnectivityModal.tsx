import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ConnectivityCheckResult,
  ConnectivityGroup,
} from "@/types/Connectivity";
import type { DownloadSource } from "@/types/Settings";
import { getDownloadVerdict } from "@renderer/utilities/connectivityVerdict";

const api = window.api;

const CONNECTIVITY_GROUPS: ConnectivityGroup[] = [
  "grubie",
  "minecraft",
  "mirror",
  "mods",
  "loaders",
  "java",
];

export function ConnectivityModal({
  initialResults,
  downloadSource,
  onClose,
}: {
  initialResults: ConnectivityCheckResult[];
  downloadSource: DownloadSource;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [results, setResults] = useState(initialResults);
  const [isTesting, setIsTesting] = useState(false);

  const runTest = async () => {
    setIsTesting(true);

    try {
      setResults(await api.connectivity.test());
    } finally {
      setIsTesting(false);
    }
  };

  const verdict = getDownloadVerdict(results, downloadSource);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col p-0 sm:max-w-xl">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>{t("settings.connectivity.title")}</DialogTitle>
          <DialogDescription>
            {t("settings.connectivity.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col px-5">
          {results.length > 0 && (
            <div className="mb-2 shrink-0 space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("settings.downloadSource")}:{" "}
                <span className="font-medium text-foreground">
                  {t(`settings.downloadSourceOptions.${downloadSource}`)}
                </span>
              </p>
              <p
                className={
                  verdict.downloadsOk
                    ? "text-sm text-emerald-500"
                    : "text-sm text-destructive"
                }
              >
                {t(`settings.connectivity.downloads.${verdict.messageKey}`)}
              </p>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 pr-2 pb-1">
              {CONNECTIVITY_GROUPS.map((group) => {
                const groupResults = results.filter(
                  (result) => result.group === group,
                );
                if (groupResults.length === 0) return null;

                return (
                  <div key={group} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t(`settings.connectivity.groups.${group}`)}
                    </p>
                    <div className="rounded-lg border bg-muted/30 p-2.5">
                      {groupResults.map((result) => (
                        <div
                          key={result.id}
                          className="flex items-center justify-between gap-2 py-1 text-sm"
                          title={
                            result.ok
                              ? result.target
                              : `${result.target}${result.error ? ` — ${result.error}` : ""}`
                          }
                        >
                          <span className="truncate">{result.name}</span>
                          <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                            {result.ok ? (
                              <>
                                {result.latencyMs != null && (
                                  <span className="text-xs text-muted-foreground">
                                    {result.latencyMs} ms
                                  </span>
                                )}
                                <CheckCircle2 className="size-4 text-emerald-500" />
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-destructive">
                                  {t("settings.connectivity.unreachable")}
                                </span>
                                <XCircle className="size-4 text-destructive" />
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="m-0 rounded-none border-t bg-muted/25 px-5 py-4">
          <Button
            variant="outline"
            disabled={isTesting}
            onClick={() => void runTest()}
          >
            {isTesting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {isTesting
              ? t("settings.connectivity.running")
              : t("settings.connectivity.run")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
