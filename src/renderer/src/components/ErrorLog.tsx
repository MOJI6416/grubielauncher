import { useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  BellOff,
  ChevronRight,
  ClipboardList,
  Copy,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  aiCrashOpenKeyAtom,
  aiCrashesAtom,
  errorLogAtom,
} from "@renderer/stores/atoms";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatRelative } from "@renderer/utilities/date";
import {
  errorLogToText,
  groupErrorLog,
} from "@renderer/features/logs/errorLog";
import { copyToClipboard } from "@renderer/utilities/clipboard";

export function ErrorLog({ onClose }: { onClose: () => void }) {
  const [errorLog, setErrorLog] = useAtom(errorLogAtom);
  const aiCrashes = useAtomValue(aiCrashesAtom);
  const setAiCrashOpenKey = useSetAtom(aiCrashOpenKeyAtom);
  const [confirmClear, setConfirmClear] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { t, i18n } = useTranslation();

  const groups = useMemo(() => groupErrorLog(errorLog), [errorLog]);

  const absolute = (time: number) =>
    new Date(time).toLocaleString(i18n.language, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="grid max-h-[min(34rem,calc(100vh-6rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" />
            {t("errorLog.title")}
          </DialogTitle>
          <DialogDescription>{t("errorLog.description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5">
          {groups.length === 0 ? (
            <Empty className="border border-dashed border-border bg-card py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BellOff />
                </EmptyMedia>
                <EmptyTitle>{t("errorLog.empty")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-1.5 pb-1">
              {groups.map((group) => {
                const expanded = open === group.id;
                const crash = group.crashKey
                  ? aiCrashes[group.crashKey]
                  : undefined;

                return (
                  <div
                    key={group.id}
                    className="rounded-xl border border-border bg-card"
                  >
                    <div className="flex min-w-0 items-start gap-2 p-2.5">
                      {group.details ? (
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={t("errorLog.details")}
                          onClick={() => setOpen(expanded ? null : group.id)}
                          className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm text-faint transition-colors hover:text-foreground"
                        >
                          <ChevronRight
                            className={cn(
                              "size-3.5 transition-transform",
                              expanded && "rotate-90",
                            )}
                          />
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug font-medium break-words">
                          {group.title}
                        </p>
                        <Hint content={absolute(group.time)} variant="text">
                          <p className="mt-0.5 w-fit text-xs text-faint">
                            {formatRelative(new Date(group.time))}
                          </p>
                        </Hint>
                      </div>

                      {group.count > 1 && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 font-mono text-[0.65rem] tabular-nums"
                        >
                          ×{group.count}
                        </Badge>
                      )}

                      {crash && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="shrink-0"
                          onClick={() => {
                            const key = group.crashKey as string;
                            onClose();
                            setTimeout(() => setAiCrashOpenKey(key), 0);
                          }}
                        >
                          <Sparkles className="size-3.5" />
                          {crash.analysis
                            ? t("aiCrash.showResult")
                            : t("aiCrash.analyzeAction")}
                        </Button>
                      )}

                      {group.details && (
                        <Hint content={t("common.copy")}>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 text-faint"
                            aria-label={t("common.copy")}
                            onClick={async () => {
                              const copied = await copyToClipboard(
                                `${group.title}\n${group.details}`,
                              );
                              if (!copied) return;
                              toast(t("common.copied"));
                            }}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        </Hint>
                      )}
                    </div>

                    {expanded && group.details && (
                      <pre className="mx-2.5 mb-2.5 max-h-56 overflow-auto rounded-lg bg-surface-1 p-2.5 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
                        {group.details}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="m-0 gap-2 rounded-none border-t border-border bg-surface-2 px-5 py-3.5 sm:justify-between">
          <Button
            variant="ghost"
            disabled={groups.length === 0}
            onClick={async () => {
              if (!(await copyToClipboard(errorLogToText(groups)))) return;
              toast(t("common.copied"));
            }}
          >
            <ClipboardList className="size-4" />
            {t("errorLog.copyAll")}
          </Button>

          <Button
            variant="outline"
            disabled={groups.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 className="size-4" />
            {t("errorLog.clear")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("errorLog.clear")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("errorLog.clearConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setErrorLog([]);
                setConfirmClear(false);
              }}
            >
              <Trash2 className="size-4" />
              {t("errorLog.clear")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
