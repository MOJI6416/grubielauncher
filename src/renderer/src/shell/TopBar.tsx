import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapseInline } from "@/components/ui/collapse";
import { Hint } from "@renderer/components/Hint";
import {
  canGoBackAtom,
  canGoForwardAtom,
  currentRouteAtom,
} from "@renderer/navigation/store";
import { goBack, goForward } from "@renderer/navigation/navigate";
import { Route } from "@renderer/navigation/routes";
import {
  internetAtom,
  networkAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { getConnectivityProblems } from "@renderer/utilities/connectivity";
import { instanceKey } from "@renderer/features/instances/selectors";
import { TaskCenter } from "@renderer/features/install/TaskCenter";
import { openConnectivityCheck } from "@renderer/features/install/installUi";
import { agentChatsAtom, agentCurrentChatAtom } from "@renderer/agent/store";
import { openAgent } from "@renderer/features/agent/openAgent";
import { agentBlockReason, blockReasonKey } from "@renderer/navigation/access";
import { accountAtom } from "@renderer/stores/atoms";
import { AGENT_SHORTCUT_LABEL } from "./shortcuts";
import { TITLEBAR_HEIGHT } from "@/shared/titlebar";
import { BrandMark } from "./BrandMark";

const api = window.api;

function useCrumbs(route: Route): { kind?: string; title: string } {
  const { t } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const chats = useAtomValue(agentChatsAtom);
  const currentChatId = useAtomValue(agentCurrentChatAtom);

  switch (route.name) {
    case "home":
      return { title: t("nav.play") };
    case "instance": {
      const instance = versions.find(
        (version) => instanceKey(version) === route.id,
      );
      return {
        kind: t("shell.nav.instance"),
        title: instance?.version.name ?? t("shell.nav.instances"),
      };
    }
    case "instance-new":
      return { title: t("shell.nav.newInstance") };
    case "people":
      return { title: t("shell.nav.people") };
    case "news":
      return { title: t("news.title") };
    case "agent": {
      const chat = chats.find((entry) => entry.id === currentChatId);
      return chat
        ? { kind: t("agent.title"), title: chat.title }
        : { title: t("agent.title") };
    }
    case "profile":
      return { title: t("shell.nav.profile") };
    case "accounts":
      return { title: t("accounts.accounts") };
    case "settings":
      return { title: t("settings.title") };
  }
}

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const route = useAtomValue(currentRouteAtom);
  const canBack = useAtomValue(canGoBackAtom);
  const canForward = useAtomValue(canGoForwardAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const account = useAtomValue(accountAtom);
  const { kind, title } = useCrumbs(route);
  const { t } = useTranslation();

  const isWindows = api.platform === "win32";
  const problem = getConnectivityProblems({
    isInternetOnline,
    isBackendOnline,
  })[0];

  const status = problem
    ? t(`app.serviceStatus.${problem}`)
    : t("app.serviceStatus.ok");

  const agentBlocked = agentBlockReason(account?.type);
  const isAgentOpen = route.name === "agent";

  return (
    <header
      className={`flex shrink-0 items-center border-b border-border bg-background select-none ${
        isWindows ? "app-drag" : ""
      }`}
      style={{
        height: TITLEBAR_HEIGHT,
        ...(isWindows
          ? { paddingRight: "calc(100vw - env(titlebar-area-width, 100vw))" }
          : {}),
      }}
    >
      <div className="flex w-62 shrink-0 items-center gap-2.5 pl-3.5">
        <span className="relative flex size-3.5 items-center justify-center">
          <BrandMark className="size-3.5 text-foreground" />
          <Hint content={status} side="bottom">
            <span
              aria-label={status}
              role="status"
              className={`app-no-drag absolute -right-1 -bottom-1 size-1.5 rounded-full ring-2 ring-background ${
                problem === "internet"
                  ? "bg-destructive"
                  : problem
                    ? "bg-warning"
                    : "bg-success"
              }`}
            />
          </Hint>
        </span>
        <span className="truncate text-xs font-medium tracking-wide text-muted-foreground">
          Grubie Launcher
        </span>
      </div>

      <div className="app-no-drag flex items-center gap-0.5">
        <Hint content={`${t("shell.back")} · Alt ←`} side="bottom">
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={!canBack}
            onClick={() => goBack()}
            aria-label={t("shell.back")}
          >
            <ChevronLeft />
          </Button>
        </Hint>
        <Hint content={`${t("shell.forward")} · Alt →`} side="bottom">
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={!canForward}
            onClick={() => goForward()}
            aria-label={t("shell.forward")}
          >
            <ChevronRight />
          </Button>
        </Hint>
      </div>

      <div className="ml-1.5 flex min-w-0 items-baseline gap-2 text-sm">
        {kind && <span className="shrink-0 text-faint">{kind}</span>}
        <span className="truncate font-medium text-foreground">{title}</span>
      </div>

      <div className="app-no-drag ml-auto flex items-center pr-2 pl-3">
        <CollapseInline show={Boolean(problem)}>
          {problem ? (
            <Hint content={status} variant="text" side="bottom">
              <button
                type="button"
                onClick={() => openConnectivityCheck()}
                className={`mr-1.5 flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs whitespace-nowrap ${
                  problem === "internet"
                    ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                    : "bg-warning/15 text-warning hover:bg-warning/25"
                }`}
              >
                <WifiOff className="size-3.5" />
                {t(`shell.offline.${problem}`)}
              </button>
            </Hint>
          ) : null}
        </CollapseInline>

        <div className="mr-1.5 flex items-center">
          <TaskCenter />
        </div>

        <Hint
          content={
            agentBlocked
              ? t(blockReasonKey(agentBlocked))
              : `${t("agent.title")} · ${AGENT_SHORTCUT_LABEL}`
          }
          side="bottom"
        >
          <button
            type="button"
            aria-label={t("agent.title")}
            aria-current={isAgentOpen}
            aria-disabled={!!agentBlocked}
            onClick={() => {
              if (agentBlocked) return;
              openAgent();
            }}
            className="mr-1.5 flex size-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-faint transition-colors hover:border-input hover:text-muted-foreground aria-[current=true]:border-transparent aria-[current=true]:bg-primary-soft aria-[current=true]:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-border aria-disabled:hover:text-faint"
          >
            <Sparkles className="size-3.5" />
          </button>
        </Hint>

        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-7 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 text-xs text-faint transition-colors hover:border-input hover:text-muted-foreground"
        >
          <Search className="size-3.5" />
          {t("shell.searchHint")}
          <kbd className="font-mono text-[0.65rem]">Ctrl K</kbd>
        </button>
      </div>
    </header>
  );
}
