import { useTranslation } from "react-i18next";
import { Bug, Gauge, HardDrive, Scale } from "lucide-react";

const SUGGESTION_KEYS = ["crash", "optimize", "cleanup", "compare"] as const;

const SUGGESTION_ICON = {
  crash: Bug,
  optimize: Gauge,
  cleanup: HardDrive,
  compare: Scale,
} as const;

export function AgentEmptyState({
  disabled,
  instanceCount,
  toolCount,
  onPickSuggestion,
}: {
  disabled: boolean;
  instanceCount: number;
  toolCount: number;
  onPickSuggestion: (text: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-base font-medium text-foreground">
        {t("agent.emptyTitle")}
      </p>
      <p className="max-w-md text-xs leading-5 text-muted-foreground">
        {t("agent.emptyHint")}
      </p>

      <div className="grid w-full max-w-md grid-cols-1 gap-1.5 pt-3">
        {SUGGESTION_KEYS.map((key) => {
          const Icon = SUGGESTION_ICON[key];

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onPickSuggestion(t(`agent.suggestions.${key}`))}
              className="flex h-11 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 text-left text-xs text-muted-foreground transition-colors hover:border-input hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon className="size-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate">
                {t(`agent.suggestions.${key}`)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="pt-2 text-[0.65rem] text-faint">
        {t("agent.emptyContext", {
          instances: t("agent.emptyContextInstances", { count: instanceCount }),
          tools: t("agent.emptyContextTools", { count: toolCount }),
        })}
      </p>
    </div>
  );
}
