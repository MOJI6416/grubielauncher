import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom, useAtomValue } from "jotai";
import {
  ClipboardCopy,
  CircleAlert,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Hint } from "@renderer/components/Hint";
import {
  leaveRunningChat,
  retryLastTurn,
  sendAgentMessage,
} from "@renderer/agent/loop";
import { chatToMarkdown } from "@renderer/agent/transcript";
import {
  openChat,
  refreshChats,
  startNewChat,
  syncChats,
} from "@renderer/agent/history";
import {
  agentChatAtom,
  agentChatsAtom,
  agentCurrentChatAtom,
  agentDraftAtom,
  agentModelAtom,
  agentProvidersAtom,
} from "@renderer/agent/store";
import { buildToolList } from "@renderer/agent/tools";
import {
  accountAtom,
  internetAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { openConnectivityCheck } from "@renderer/features/install/installUi";
import { pendingInteraction } from "@renderer/features/agent/timelineGroups";
import type { AgentErrorRecovery } from "@renderer/features/agent/providerErrors";
import {
  readRailPreference,
  writeRailPreference,
} from "@renderer/features/agent/railPreference";
import { AgentTimeline } from "@renderer/features/agent/AgentTimeline";
import { AgentComposer } from "@renderer/features/agent/AgentComposer";
import { AgentHistoryRail } from "@renderer/features/agent/AgentHistoryRail";
import { AgentContextRail } from "@renderer/features/agent/AgentContextRail";
import { AgentProvidersModal } from "@renderer/features/agent/AgentProvidersModal";
import { AgentSetupCard } from "@renderer/features/agent/AgentSetupCard";
import { AgentEmptyState } from "@renderer/features/agent/AgentEmptyState";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

export function AgentScreen({ chatId }: { chatId?: string }) {
  const { t } = useTranslation();
  const chat = useAtomValue(agentChatAtom);
  const [providers, setProviders] = useAtom(agentProvidersAtom);
  const currentChatId = useAtomValue(agentCurrentChatAtom);
  const model = useAtomValue(agentModelAtom);
  const [pendingDraft, setPendingDraft] = useAtom(agentDraftAtom);
  const isOnline = useAtomValue(internetAtom);
  const account = useAtomValue(accountAtom);
  const versions = useAtomValue(versionsAtom);
  const chats = useAtomValue(agentChatsAtom);
  const [draft, setDraft] = useState("");
  const [isProvidersOpen, setIsProvidersOpen] = useState(false);
  const [providersFailed, setProvidersFailed] = useState(false);
  const [isRailOpen, setIsRailOpen] = useState(readRailPreference);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openedRef = useRef<string | null>(null);

  const toolNames = useMemo(
    () => buildToolList().map((tool) => tool.name),
    [isOnline, account],
  );

  const loadProviders = useCallback(async () => {
    const next = await api.agent.providers.list();
    setProvidersFailed(next === null);
    if (next) setProviders(next);
  }, [setProviders]);

  useEffect(() => {
    if (providers) return;
    void loadProviders();
  }, [providers, loadProviders]);

  useEffect(() => {
    void refreshChats().then(() => syncChats());
  }, []);

  useEffect(() => {
    if (!chatId || chatId === currentChatId) return;
    if (openedRef.current === chatId) return;

    openedRef.current = chatId;
    void leaveRunningChat(true).then(() => openChat(chatId));
  }, [chatId, currentChatId]);

  useEffect(() => {
    if (pendingDraft === null) return;

    startNewChat();
    setDraft(pendingDraft);
    setPendingDraft(null);
    inputRef.current?.focus();
  }, [pendingDraft, setPendingDraft]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const active = providers?.providers.find(
    (provider) => provider.id === providers.selectedId,
  );

  const blocked = pendingInteraction(chat.timeline) !== null;

  const chatTitle =
    chats.find((entry) => entry.id === currentChatId)?.title ??
    t("agent.newChat");

  const reloadProviders = useCallback(() => {
    void loadProviders();
  }, [loadProviders]);

  const submit = useCallback(async () => {
    if (!active?.hasKey || chat.running || draft.trim() === "") return;

    if (!currentChatId) startNewChat();

    const text = draft;
    setDraft("");
    await sendAgentMessage(active.id, text, model);
  }, [active, chat.running, currentChatId, draft, model]);

  const newChat = useCallback(async () => {
    await leaveRunningChat(true);
    startNewChat();
    setDraft("");
    openedRef.current = null;
    navigate({ name: "agent" }, { replace: true });
    inputRef.current?.focus();
  }, []);

  const recover = useCallback(
    (recovery: AgentErrorRecovery) => {
      if (recovery === "providers") {
        setIsProvidersOpen(true);
        return;
      }
      if (recovery === "connectivity") {
        openConnectivityCheck();
        return;
      }
      if (recovery === "newChat") {
        void newChat();
        return;
      }
      if (recovery === "retry" || recovery === "continue") {
        if (active) void retryLastTurn(active.id, model);
        return;
      }
      if (recovery === "model") {
        document
          .querySelector<HTMLButtonElement>("#agent-model-picker button")
          ?.click();
      }
    },
    [active, model, newChat],
  );

  const toggleRail = () => {
    setIsRailOpen((value) => {
      const next = !value;
      writeRailPreference(next);
      return next;
    });
  };

  if (!providers) {
    if (providersFailed) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="flex max-w-md flex-col items-center gap-2 text-center">
            <CircleAlert className="size-6 text-destructive" />
            <p className="text-sm font-medium text-foreground">
              {t("agent.providers.loadFailed")}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("agent.providers.loadFailedHint")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => {
                setProvidersFailed(false);
                void loadProviders();
              }}
            >
              <RefreshCw className="size-3.5" />
              {t("common.retry")}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full gap-3">
        <Skeleton className="h-full w-52 rounded-xl" />
        <Skeleton className="h-full flex-1 rounded-xl" />
      </div>
    );
  }

  if (providers.providers.length === 0) {
    return (
      <>
        <AgentSetupCard
          toolNames={toolNames}
          onStart={() => setIsProvidersOpen(true)}
        />

        {isProvidersOpen && (
          <AgentProvidersModal
            onClose={() => {
              setIsProvidersOpen(false);
              reloadProviders();
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 gap-3">
        <AgentHistoryRail
          onNewChat={() => void newChat()}
          onOpenChat={(id) => navigate({ name: "agent", chatId: id })}
        />

        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border bg-surface-1">
          <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <Hint content={chatTitle} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {chatTitle}
              </span>
            </Hint>

            {chat.timeline.length > 0 && !chat.running && (
              <>
                <Hint content={t("agent.retry")}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("agent.retry")}
                    onClick={() => {
                      if (active) void retryLastTurn(active.id, model);
                    }}
                  >
                    <RotateCcw />
                  </Button>
                </Hint>
                <Hint content={t("agent.copyTranscript")}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("agent.copyTranscript")}
                    onClick={async () => {
                      if (
                        !(await copyToClipboard(
                          chatToMarkdown(t("agent.title"), chat.timeline),
                        ))
                      )
                        return;
                      toast.success(t("agent.transcriptCopied"));
                    }}
                  >
                    <ClipboardCopy />
                  </Button>
                </Hint>
              </>
            )}

            <Hint content={t("agent.providers.settingsRowOpen")}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("agent.providers.settingsRowOpen")}
                onClick={() => setIsProvidersOpen(true)}
              >
                <Settings2 />
              </Button>
            </Hint>

            <Hint content={t("agent.rail.toggle")}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("agent.rail.toggle")}
                onClick={toggleRail}
              >
                {isRailOpen ? <PanelRightClose /> : <PanelRightOpen />}
              </Button>
            </Hint>
          </header>

          {chat.timeline.length === 0 ? (
            <AgentEmptyState
              disabled={!active?.hasKey}
              instanceCount={versions.length}
              toolCount={toolNames.length}
              onPickSuggestion={(text) => {
                setDraft(text);
                inputRef.current?.focus();
              }}
            />
          ) : (
            <AgentTimeline items={chat.timeline} onRecover={recover} />
          )}

          <AgentComposer
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={() => void submit()}
            onOpenProviders={() => setIsProvidersOpen(true)}
            inputRef={inputRef}
            provider={active}
            blocked={blocked}
            toolCount={toolNames.length}
          />
        </section>

        {isRailOpen && (
          <AgentContextRail
            toolNames={toolNames}
            isOnline={isOnline}
            hasAccount={Boolean(account)}
          />
        )}
      </div>

      {isProvidersOpen && (
        <AgentProvidersModal
          onClose={() => {
            setIsProvidersOpen(false);
            reloadProviders();
          }}
        />
      )}
    </>
  );
}
