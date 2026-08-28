import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Check,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Wifi,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { STATUS_URL } from "@/shared/config";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ConnectivityCheckPlanEntry,
  ConnectivityCheckResult,
} from "@/types/Connectivity";
import { settingsAtom } from "@renderer/stores/atoms";
import { getDownloadVerdict } from "@renderer/utilities/connectivityVerdict";
import {
  buildConnectivityReport,
  groupConnectivity,
  latencyTone,
  mergeConnectivityResult,
} from "@renderer/features/install/connectivityModel";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

const LATENCY_TONE = {
  fast: "text-success",
  ok: "text-faint",
  slow: "text-warning",
};

export function ConnectivityModal({
  initialResults = [],
  onClose,
}: {
  initialResults?: ConnectivityCheckResult[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const [results, setResults] = useState(initialResults);
  const [plan, setPlan] = useState<ConnectivityCheckPlanEntry[]>([]);
  const [isTesting, setTesting] = useState(false);
  const runRef = useRef(0);

  const runTest = async () => {
    const run = runRef.current + 1;
    runRef.current = run;

    setTesting(true);
    setResults([]);

    try {
      const final = await api.connectivity.test();
      if (runRef.current === run) setResults(final);
    } finally {
      if (runRef.current === run) setTesting(false);
    }
  };

  useEffect(() => {
    return api.connectivity.onResult((result) => {
      setResults((current) => mergeConnectivityResult(current, result));
    });
  }, []);

  useEffect(() => {
    let active = true;
    void api.connectivity.plan().then((entries) => {
      if (active) setPlan(entries);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (initialResults.length === 0) void runTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verdict = getDownloadVerdict(results, settings.downloadSource);
  const groups = groupConnectivity(results, plan);
  const okCount = results.filter((result) => result.ok).length;
  const total = plan.length || results.length;

  const copyReport = async () => {
    const copied = await copyToClipboard(
      buildConnectivityReport(results, settings.downloadSource),
    );
    if (!copied) return;
    toast.success(t("common.copied"));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wifi className="size-4" />
            {t("settings.connectivity.title")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.connectivity.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-2 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-faint">
              {t("settings.downloadSource")}:{" "}
              <span className="text-muted-foreground">
                {t(`settings.downloadSourceOptions.${settings.downloadSource}`)}
              </span>
            </p>
            <p
              className={`truncate text-sm ${
                isTesting
                  ? "text-muted-foreground"
                  : results.length === 0
                    ? "text-warning"
                    : verdict.downloadsOk
                      ? "text-success"
                      : "text-destructive"
              }`}
            >
              {isTesting
                ? t("settings.connectivity.running")
                : results.length === 0
                  ? t("settings.connectivity.noResults")
                  : t(`settings.connectivity.downloads.${verdict.messageKey}`)}
            </p>
          </div>
          {total > 0 && (
            <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
              {okCount}/{total}
            </span>
          )}
          {isTesting && (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div className="flex flex-col gap-2.5">
            {groups.map((view) => (
              <section key={view.group} className="rounded-lg bg-surface-2 p-2">
                <div className="flex items-center gap-2 px-1 pb-1">
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                    {t(`settings.connectivity.groups.${view.group}`)}
                  </p>
                  <span
                    className={`shrink-0 font-mono text-[11px] tabular-nums ${
                      isTesting
                        ? "text-faint"
                        : view.okCount === view.total
                          ? "text-success"
                          : "text-destructive"
                    }`}
                  >
                    {view.okCount}/{view.total}
                  </span>
                </div>

                {view.rows.map(({ id, name, result }) => (
                  <Hint
                    key={id}
                    variant="text"
                    content={
                      result
                        ? result.ok
                          ? result.target
                          : `${result.target}${result.error ? ` — ${result.error}` : ""}`
                        : name
                    }
                  >
                    <div className="flex h-7 items-center gap-2 px-1 text-sm">
                      {!result ? (
                        <Loader2 className="size-3.5 shrink-0 animate-spin text-faint" />
                      ) : result.ok ? (
                        <Check className="size-3.5 shrink-0 text-success" />
                      ) : (
                        <X className="size-3.5 shrink-0 text-destructive" />
                      )}
                      <span
                        className={`min-w-0 flex-1 truncate text-xs ${
                          result ? "text-foreground" : "text-faint"
                        }`}
                      >
                        {name}
                      </span>
                      <span
                        className={`shrink-0 font-mono text-[11px] tabular-nums ${
                          !result
                            ? "text-faint"
                            : result.ok
                              ? LATENCY_TONE[latencyTone(result.latencyMs)]
                              : "text-destructive"
                        }`}
                      >
                        {!result
                          ? "…"
                          : result.ok
                            ? `${result.latencyMs ?? 0} ms`
                            : t("settings.connectivity.unreachable")}
                      </span>
                    </div>
                  </Hint>
                ))}
              </section>
            ))}

            {groups.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {isTesting
                  ? t("settings.connectivity.running")
                  : t("settings.connectivity.noResults")}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="m-0 shrink-0 flex-row items-center justify-between gap-1 rounded-none border-t border-border px-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void api.shell.openExternal(STATUS_URL)}
          >
            <ExternalLink className="size-3.5" />
            {t("settings.connectivity.statusPage")}
          </Button>

          <span className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={isTesting || results.length === 0}
              onClick={() => void copyReport()}
            >
              <ClipboardCopy className="size-3.5" />
              {t("common.copy")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isTesting}
              onClick={() => void runTest()}
            >
              {isTesting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {isTesting
                ? t("settings.connectivity.running")
                : t("settings.connectivity.run")}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
