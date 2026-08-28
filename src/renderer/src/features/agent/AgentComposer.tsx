import { RefObject, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { KeyRound, Loader2, Send, Square, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiProviderProfile } from "@/types/Agent";
import { Hint } from "@renderer/components/Hint";
import { abortAgentRun, agentChatAtom, MAX_STEPS } from "@renderer/agent/store";
import { hasOpenOverlay } from "./overlayLayer";
import { activeToolLabel } from "./timelineGroups";
import { AgentModelPicker } from "./AgentModelPicker";

export function AgentComposer({
  draft,
  onDraftChange,
  onSubmit,
  onOpenProviders,
  inputRef,
  provider,
  blocked,
  toolCount,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onOpenProviders: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  provider: AiProviderProfile | undefined;
  blocked: boolean;
  toolCount: number;
}) {
  const { t } = useTranslation();
  const chat = useAtomValue(agentChatAtom);

  const running = chat.running;
  const hasKey = Boolean(provider?.hasKey);
  const canSend = hasKey && !running && !blocked && draft.trim() !== "";

  useEffect(() => {
    if (!running || blocked) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (hasOpenOverlay()) return;

      event.preventDefault();
      void abortAgentRun();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [blocked, running]);

  const activeTool = activeToolLabel(chat.timeline);
  const status = activeTool
    ? t(activeTool.label.key, {
        ...activeTool.label.params,
        defaultValue: activeTool.name,
      })
    : t("agent.working");

  return (
    <div className="shrink-0 border-t border-border px-4 py-2.5">
      {running && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {status}
          </span>
          <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
            {chat.steps}/{MAX_STEPS}
          </span>
          <span className="shrink-0 text-[0.65rem] text-faint">
            {t("agent.stopHint")}
          </span>
        </div>
      )}

      {!hasKey && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-warning/40 bg-surface-2 px-2.5 py-1.5">
          <KeyRound className="size-3.5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1 text-xs text-warning">
            {t("agent.noProvider")}
          </span>
          <Button variant="outline" size="xs" onClick={onOpenProviders}>
            {t("agent.providers.settingsRowOpen")}
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          ref={inputRef}
          value={draft}
          rows={1}
          spellCheck={false}
          disabled={!hasKey}
          placeholder={
            blocked ? t("agent.answerFirst") : t("agent.placeholder")
          }
          className="max-h-32 min-h-9 resize-none"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) onSubmit();
            }
          }}
        />

        {running ? (
          <Button
            variant="secondary"
            size="icon-lg"
            className="shrink-0"
            aria-label={t("agent.stop")}
            onClick={() => void abortAgentRun()}
          >
            <Square />
          </Button>
        ) : (
          <Button
            size="icon-lg"
            variant={blocked ? "secondary" : "default"}
            className="shrink-0"
            disabled={!canSend}
            aria-label={t("agent.send")}
            onClick={onSubmit}
          >
            <Send />
          </Button>
        )}
      </div>

      <div className="mt-1.5 flex h-8 items-center gap-2">
        {provider && (
          <AgentModelPicker provider={provider} disabled={running} />
        )}
        <Hint content={t("agent.toolsReady", { count: toolCount })}>
          <span className="flex shrink-0 items-center gap-1 text-[0.65rem] text-faint">
            <Wrench className="size-3" />
            <span className="font-mono tabular-nums">{toolCount}</span>
          </span>
        </Hint>
        <span className="ml-auto min-w-0 truncate text-[0.65rem] text-faint">
          {t("agent.sendHint")}
        </span>
      </div>
    </div>
  );
}
