import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FolderSearch, HardDrive, Loader2, TriangleAlert } from "lucide-react";
import icon from "@renderer/assets/icon.png";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { changeAppLanguage } from "@renderer/i18n";
import { formatBytes } from "@renderer/utilities/file";
import { PathRows } from "./PathRows";
import type {
  DataLocationWindowAction,
  DataLocationWindowState,
} from "@/types/DataLocation";

const api = window.api;

function act(action: DataLocationWindowAction): void {
  void api.dataLocationWindow.action(action);
}

function Header({
  badge,
  title,
  description,
}: {
  badge: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {badge}
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-semibold leading-5">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function WarningBadge({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
      {children}
    </span>
  );
}

export function DataLocationWindow() {
  const { t } = useTranslation();
  const [state, setState] = useState<DataLocationWindowState | null>(null);
  const [lang, setLang] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    void api.dataLocationWindow.getState().then((initial) => {
      if (initial) setState((current) => current ?? initial);
    });
    return api.dataLocationWindow.onState(setState);
  }, []);

  useEffect(() => {
    const next = state?.lang;
    if (!next) return;
    void changeAppLanguage(next).finally(() => setLang(next));
  }, [state?.lang]);

  const sizes = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];
  const bytes = (value: number) => formatBytes(value, sizes, 1);

  if (!state || !lang) return <div className="h-screen" />;

  let body: ReactNode;

  if (state.kind === "moving") {
    const percent =
      state.totalBytes > 0
        ? Math.min(100, (state.copiedBytes / state.totalBytes) * 100)
        : 0;
    const counting = state.phase === "scan";

    body = (
      <>
        <Header
          badge={
            <img
              src={icon}
              alt=""
              draggable={false}
              className="size-10 shrink-0 rounded-xl"
            />
          }
          title={t("dataLocation.window.movingTitle")}
          description={t("dataLocation.window.movingDescription")}
        />
        <PathRows
          className="app-no-drag"
          rows={[
            { label: t("dataLocation.from"), path: state.from },
            { label: t("dataLocation.to"), path: state.to },
          ]}
        />
        <div className="space-y-1.5">
          <Progress
            value={counting ? 12 : state.phase === "finish" ? 100 : percent}
            className={counting ? "animate-pulse" : undefined}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {(counting || state.phase === "finish" || state.cancelling) && (
                <Loader2 className="size-3 shrink-0 animate-spin" />
              )}
              {state.cancelling
                ? t("dataLocation.window.cancelling")
                : counting
                  ? t("dataLocation.window.counting")
                  : state.phase === "finish"
                    ? t("dataLocation.window.finishing")
                    : t("dataLocation.window.copied", {
                        copied: bytes(state.copiedBytes),
                        total: bytes(state.totalBytes),
                      })}
            </span>
            {!counting && (
              <span className="shrink-0 font-mono tabular-nums">
                {percent.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        <div className="mt-auto flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="app-no-drag"
            disabled={state.cancelling || state.phase === "finish"}
            onClick={() => act("cancel")}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </>
    );
  } else if (state.kind === "failed") {
    body = (
      <>
        <Header
          badge={
            <WarningBadge>
              <TriangleAlert className="size-5" />
            </WarningBadge>
          }
          title={t("dataLocation.window.failedTitle")}
          description={t("dataLocation.window.failedDescription")}
        />
        <div className="space-y-1 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <p className="text-xs text-foreground">
            {t(`dataLocation.failures.${state.reason}`)}
          </p>
          {state.detail && (
            <p className="line-clamp-3 font-mono text-[0.7rem] break-all text-faint">
              {state.detail}
            </p>
          )}
        </div>
        <PathRows
          className="app-no-drag"
          rows={[{ label: t("dataLocation.current"), path: state.from }]}
        />
        <div className="mt-auto flex justify-end">
          <Button
            size="sm"
            className="app-no-drag"
            onClick={() => act("continue")}
          >
            {t("dataLocation.window.continue")}
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <Header
          badge={
            <WarningBadge>
              <HardDrive className="size-5" />
            </WarningBadge>
          }
          title={t("dataLocation.window.missingTitle")}
          description={t("dataLocation.window.missingDescription")}
        />
        <PathRows
          className="app-no-drag"
          rows={[{ label: t("dataLocation.folder"), path: state.root }]}
        />
        {state.problem && (
          <p className="text-xs leading-snug text-warning">
            {t(`dataLocation.problems.${state.problem}`)}
          </p>
        )}
        <button
          type="button"
          disabled={state.busy}
          onClick={() => act("useDefault")}
          className="app-no-drag self-start text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
        >
          {t("dataLocation.window.useDefault")}
        </button>
        <div className="mt-auto flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="app-no-drag"
            disabled={state.busy}
            onClick={() => act("quit")}
          >
            {t("dataLocation.window.quit")}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="app-no-drag"
              disabled={state.busy}
              onClick={() => act("pick")}
            >
              {state.busy ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FolderSearch />
              )}
              {t("dataLocation.window.pick")}
            </Button>
            <Button
              size="sm"
              className="app-no-drag"
              disabled={state.busy}
              onClick={() => act("retry")}
            >
              {t("dataLocation.window.retry")}
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-screen text-foreground">
      <div className="app-drag flex h-full w-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-xl">
        {body}
      </div>
    </div>
  );
}
