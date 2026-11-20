import { useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  BellOff,
  ChevronRight,
  ClipboardList,
  Copy,
  ScrollText,
  Trash2,
} from "lucide-react";
import {
  aiCrashesAtom,
  errorLogAtom,
  errorLogSeenAtom,
} from "@renderer/stores/atoms";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatRelative } from "@renderer/utilities/date";
import {
  errorLogToText,
  groupErrorLog,
} from "@renderer/features/logs/errorLog";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { showUndoToast } from "@renderer/utilities/undoToast";
import { navigate } from "@renderer/navigation/navigate";
import { useRedact } from "@renderer/features/streamer/streamerMode";

export function ErrorLogActions() {
  const [errorLog, setErrorLog] = useAtom(errorLogAtom);
  const { t } = useTranslation();
  const groups = useMemo(() => groupErrorLog(errorLog), [errorLog]);

  const clear = () => {
    const previous = errorLog;
    setErrorLog([]);
    showUndoToast(t("errorLog.cleared"), () =>
      setErrorLog((current) => [...current, ...previous]),
    );
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={groups.length === 0}
        onClick={clear}
      >
        <Trash2 className="size-3.5" />
        {t("errorLog.clear")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={groups.length === 0}
        onClick={async () => {
          await copyWithFeedback(errorLogToText(groups));
        }}
      >
        <ClipboardList className="size-3.5" />
        {t("errorLog.copyAll")}
      </Button>
    </>
  );
}

export function ErrorLogView() {
  const errorLog = useAtomValue(errorLogAtom);
  const setErrorLogSeen = useSetAtom(errorLogSeenAtom);
  const aiCrashes = useAtomValue(aiCrashesAtom);
  const [open, setOpen] = useState<string | null>(null);
  const { t, i18n } = useTranslation();
  const redact = useRedact();

  const groups = useMemo(() => groupErrorLog(errorLog), [errorLog]);
  const latest = errorLog[0]?.time ?? 0;

  useEffect(() => {
    if (latest) setErrorLogSeen((seen) => Math.max(seen, latest));
  }, [latest, setErrorLogSeen]);

  const absolute = (time: number) =>
    new Date(time).toLocaleString(i18n.language, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  if (groups.length === 0) {
    return (
      <Empty className="border border-dashed border-border bg-card py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellOff />
          </EmptyMedia>
          <EmptyTitle>{t("errorLog.empty")}</EmptyTitle>
          <EmptyDescription>{t("errorLog.description")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-0.5 pb-1 text-xs text-faint">
        {t("errorLog.description")}
      </p>
      {groups.map((group) => {
        const expanded = open === group.id;
        const crash = group.crashKey ? aiCrashes[group.crashKey] : undefined;

        return (
          <div
            key={group.id}
            className="rounded-xl border border-border bg-card"
          >
            <div className="flex min-w-0 items-start gap-2 p-2.5">
              {group.details ? (
                <Hint content={t("errorLog.details")}>
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
                </Hint>
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
                  className="shrink-0 font-mono text-3xs tabular-nums"
                >
                  ×{group.count}
                </Badge>
              )}

              {crash && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() =>
                    navigate({
                      name: "instance",
                      id: crash.crash.versionPath || crash.crash.versionName,
                      tab: "logs",
                    })
                  }
                >
                  <ScrollText className="size-3.5" />
                  {t("errorLog.openLogs")}
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
                      await copyWithFeedback(
                        `${group.title}\n${group.details}`,
                      );
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </Hint>
              )}
            </div>

            {expanded && group.details && (
              <pre className="mx-2.5 mb-2.5 max-h-56 overflow-auto rounded-lg bg-surface-1 p-2.5 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
                {redact.text(group.details)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
