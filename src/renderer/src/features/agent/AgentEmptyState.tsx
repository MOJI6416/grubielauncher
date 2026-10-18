import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Bug, Gauge, HardDrive, RefreshCw, Scale } from "lucide-react";
import {
  consolesAtom,
  selectedVersionAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { instanceUpdatesAtom } from "@renderer/features/instances/updateCheck";
import { instanceKey } from "@renderer/features/instances/selectors";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import { AgentSuggestionId, pickSuggestions } from "./suggestions";

const SUGGESTION_ICON: Record<AgentSuggestionId, typeof Bug> = {
  crashNamed: Bug,
  updateNamed: RefreshCw,
  optimizeNamed: Gauge,
  crash: Bug,
  optimize: Gauge,
  cleanup: HardDrive,
  compare: Scale,
};

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
  const redact = useRedact();
  const consoles = useAtomValue(consolesAtom).consoles;
  const selected = useAtomValue(selectedVersionAtom);
  const versions = useAtomValue(versionsAtom);
  const updates = useAtomValue(instanceUpdatesAtom);

  const suggestions = useMemo(() => {
    const crashed =
      consoles
        .filter((entry) => entry.status === "error")
        .sort((a, b) => b.startTime - a.startTime)[0]?.versionName ?? null;
    const updatable =
      versions.find((version) => updates[instanceKey(version)] === "behind")
        ?.version.name ?? null;

    return pickSuggestions({
      crashed,
      updatable,
      selected: selected?.version.name ?? null,
      instanceCount,
    });
  }, [consoles, versions, updates, selected, instanceCount]);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-base font-medium text-foreground">
        {t("agent.emptyTitle")}
      </p>
      <p className="max-w-md text-xs leading-5 text-muted-foreground">
        {t("agent.emptyHint")}
      </p>

      <div className="grid w-full max-w-md grid-cols-1 gap-1.5 pt-3">
        {suggestions.map((suggestion) => {
          const Icon = SUGGESTION_ICON[suggestion.id];
          const text = t(`agent.suggestions.${suggestion.id}`, {
            name: suggestion.name,
          });

          return (
            <button
              key={suggestion.id}
              type="button"
              disabled={disabled}
              onClick={() => onPickSuggestion(text)}
              className="flex h-11 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 text-left text-xs text-muted-foreground transition-colors hover:border-input hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon className="size-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate">
                {redact.text(text)}
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
