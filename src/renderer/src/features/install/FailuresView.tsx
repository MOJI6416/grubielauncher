import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardCopy,
  Loader2,
  RotateCw,
  Wifi,
} from "lucide-react";
import { DownloaderFailuresInfo } from "@/types/Downloader";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import {
  describeFailure,
  showFailureToast,
} from "@renderer/utilities/failures";
import {
  accountAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import {
  buildFailureReport,
  countRetryable,
  groupFailures,
} from "./failureGroups";
import {
  installFailuresAtom,
  installFailuresSeenAtom,
  openConnectivityCheck,
  taskCenterViewAtom,
} from "./installUi";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const FILES_PREVIEW = 4;

export function FailuresView({ info }: { info: DownloaderFailuresInfo }) {
  const store = useStore();
  const setView = useSetAtom(taskCenterViewAtom);
  const setFailures = useSetAtom(installFailuresAtom);
  const setFailuresSeen = useSetAtom(installFailuresSeenAtom);
  const versions = useAtomValue(versionsAtom);
  const account = useAtomValue(accountAtom);
  const settings = useAtomValue(settingsAtom);
  const [isRetrying, setRetrying] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    setFailuresSeen(true);
  }, [setFailuresSeen]);

  const groups = groupFailures(info.failures);
  const retryable = countRetryable(groups);
  const target = info.versionName
    ? (versions.find((item) => item.version.name === info.versionName) ?? null)
    : null;
  const canRetry = Boolean(target && account && retryable > 0);
  const retryHint =
    retryable === 0
      ? t("downloadFailures.notRetryable")
      : target && account
        ? undefined
        : t("downloadFailures.retryNoInstance");

  const retry = async () => {
    if (!target || !account) return;

    setRetrying(true);
    try {
      await target.install(account, settings);

      if (store.get(installFailuresAtom)) {
        setFailuresSeen(true);
        return;
      }

      setFailures(null);
      setFailuresSeen(true);
      setView("tasks");
    } catch (error) {
      showFailureToast(t("versions.installError"), error);
    } finally {
      setRetrying(false);
    }
  };

  const copyReport = async () => {
    if (!(await copyToClipboard(buildFailureReport(info, groups)))) return;
    toast.success(t("common.copied"));
  };

  return (
    <div className="flex max-h-[35rem] flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-2 pr-3.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("shell.back")}
          onClick={() => setView("tasks")}
        >
          <ArrowLeft />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {t("downloadFailures.title")}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-destructive">
          {info.failedItems}
        </span>
      </header>

      <p className="flex h-8 shrink-0 min-w-0 items-center gap-1.5 border-b border-border px-3.5 text-xs text-muted-foreground">
        {info.versionName && (
          <>
            <Hint content={info.versionName} variant="text" truncatedOnly>
              <span className="max-w-40 shrink truncate font-medium text-foreground">
                {info.versionName}
              </span>
            </Hint>
            <span aria-hidden>·</span>
          </>
        )}
        <span className="min-w-0 truncate">
          {t("downloadFailures.summary", {
            completed: info.completedItems,
            count: info.totalItems,
          })}
        </span>
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        <div className="flex flex-col gap-2">
          {groups.map((group) => {
            const described = describeFailure(group.info);
            const isOpen = expanded === group.key;
            const shown = isOpen
              ? group.items
              : group.items.slice(0, FILES_PREVIEW);

            return (
              <article
                key={group.key}
                className={`min-w-0 rounded-lg border bg-surface-2 p-2.5 ${
                  group.retryable ? "border-border" : "border-destructive/30"
                }`}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <span
                    className={`mt-px shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                      group.retryable
                        ? "bg-surface-3 text-muted-foreground"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {group.code}
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-4 text-foreground">
                    {described.reason}
                  </span>
                  <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-faint">
                    ×{group.items.length}
                  </span>
                </div>

                {described.hint && (
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {described.hint}
                  </p>
                )}

                <ul className="mt-1.5">
                  {shown.map((item, index) => (
                    <Hint
                      key={`${item.destination}-${index}`}
                      content={item.fileName}
                      variant="text"
                      truncatedOnly
                    >
                      <li className="truncate font-mono text-[11px] text-faint">
                        {item.fileName}
                      </li>
                    </Hint>
                  ))}
                </ul>

                {group.items.length > FILES_PREVIEW && (
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setExpanded(isOpen ? null : group.key)}
                  >
                    {isOpen
                      ? t("downloadFailures.less")
                      : t("downloadFailures.more", {
                          count: group.items.length - FILES_PREVIEW,
                        })}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <footer className="flex h-11 shrink-0 items-center gap-1 border-t border-border px-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openConnectivityCheck}
        >
          <Wifi className="size-3.5" />
          {t("taskCenter.checkConnection")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => void copyReport()}
        >
          <ClipboardCopy className="size-3.5" />
          {t("common.copy")}
        </Button>
        <Hint content={canRetry ? undefined : retryHint}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canRetry || isRetrying}
            onClick={() => void retry()}
          >
            {isRetrying ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCw className="size-3.5" />
            )}
            {t("common.retry")}
          </Button>
        </Hint>
      </footer>
    </div>
  );
}
