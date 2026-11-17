import { RefObject, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { Heart, KeyRound, Loader2, Send, Square, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AgentBuiltinStatus, AiProviderProfile } from "@/types/Agent";
import { Hint } from "@renderer/components/Hint";
import { showFailureToast } from "@renderer/utilities/failures";
import { abortAgentRun, agentChatAtom, MAX_STEPS } from "@renderer/agent/store";
import { cn } from "@/lib/utils";
import { hasOpenOverlay } from "./overlayLayer";
import { agentBuiltinStatusAtom, isBuiltinLocked } from "./builtinStatus";
import { activeToolLabel } from "./timelineGroups";
import { AgentModelPicker } from "./AgentModelPicker";

function BuiltinQuota({ status }: { status: AgentBuiltinStatus | null }) {
  const { t } = useTranslation();

  if (!status || !status.allowed || status.limit === 0) return null;

  const reset = status.resetAt
    ? new Date(status.resetAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Hint
      content={
        reset
          ? t("agent.builtin.quotaHintReset", {
              limit: status.limit,
              time: reset,
            })
          : t("agent.builtin.quotaHint", { limit: status.limit })
      }
    >
      <span
        className={cn(
          "shrink-0 font-mono text-3xs tabular-nums",
          status.remaining === 0 ? "text-warning" : "text-faint",
        )}
      >
        {t("agent.builtin.remaining", { count: status.remaining })}
      </span>
    </Hint>
  );
}

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
  const { t, i18n } = useTranslation();
  const chat = useAtomValue(agentChatAtom);

  const running = chat.running;
  const builtinStatus = useAtomValue(agentBuiltinStatusAtom);
  const locked = isBuiltinLocked(provider?.builtin, builtinStatus);
  const hasKey = Boolean(provider?.hasKey) && !locked;
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
          <Loader2 className="size-3.5 shrink-0 animate-spin text-info" />
          <Hint content={status} variant="text" truncatedOnly>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {status}
            </span>
          </Hint>
          <span className="shrink-0 font-mono text-3xs whitespace-nowrap tabular-nums text-faint">
            {chat.steps}/{MAX_STEPS}
          </span>
          <span className="shrink-0 text-3xs text-faint">
            {t("agent.stopHint")}
          </span>
        </div>
      )}

      {locked && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-2.5 py-1.5">
          <Heart className="size-3.5 shrink-0 text-info" />
          <span className="min-w-0 flex-1 text-xs text-foreground">
            {t("agent.builtin.locked")}
          </span>
          <Button variant="outline" size="xs" onClick={onOpenProviders}>
            <KeyRound />
            {t("agent.builtin.ownKey")}
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              void window.api.shell
                .openExternal(
                  `https://grubielauncher.com/${i18n.resolvedLanguage ?? "en"}/donate`,
                )
                .catch((error) =>
                  showFailureToast(t("settings.about.openLinkFailed"), error, {
                    channels: ["shell:openExternal"],
                  }),
                )
            }
          >
            <Heart />
            {t("agent.builtin.support")}
          </Button>
        </div>
      )}

      {!hasKey && !locked && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-warning/40 bg-surface-2 px-2.5 py-1.5">
          <KeyRound className="size-3.5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1 text-xs text-warning">
            {t("agent.noProviderShort")}
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
          <Hint content={t("agent.stop")}>
            <Button
              variant="secondary"
              size="icon-lg"
              className="shrink-0"
              aria-label={t("agent.stop")}
              onClick={() => void abortAgentRun()}
            >
              <Square />
            </Button>
          </Hint>
        ) : (
          <Hint content={canSend ? t("agent.send") : undefined}>
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
          </Hint>
        )}
      </div>

      <div className="mt-1.5 flex h-8 items-center gap-2">
        {provider && (
          <AgentModelPicker provider={provider} disabled={running} />
        )}
        <Hint content={t("agent.toolsReady", { count: toolCount })}>
          <span className="flex shrink-0 items-center gap-1 text-3xs text-faint">
            <Wrench className="size-3" />
            <span className="font-mono tabular-nums">{toolCount}</span>
          </span>
        </Hint>
        {provider?.builtin && <BuiltinQuota status={builtinStatus} />}
        <Hint content={t("agent.sendHint")} variant="text" truncatedOnly>
          <span className="ml-auto min-w-0 truncate text-3xs text-faint">
            {t("agent.sendHint")}
          </span>
        </Hint>
      </div>
    </div>
  );
}
