import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Bug,
  Gauge,
  HardDrive,
  RefreshCw,
  Scale,
  Sparkles,
} from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
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
    <Empty className="min-h-0 gap-3 px-8">
      <EmptyHeader className="max-w-md">
        <EmptyMedia variant="icon">
          <Sparkles />
        </EmptyMedia>
        <EmptyTitle className="text-base">{t("agent.emptyTitle")}</EmptyTitle>
        <EmptyDescription className="text-xs leading-5">
          {t("agent.emptyHint")}
        </EmptyDescription>
      </EmptyHeader>

      <EmptyContent className="grid max-w-md grid-cols-1 gap-1.5">
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
              <Hint content={redact.text(text)} variant="text" truncatedOnly>
                <span className="min-w-0 flex-1 truncate">
                  {redact.text(text)}
                </span>
              </Hint>
            </button>
          );
        })}
      </EmptyContent>

      <p className="text-3xs text-faint">
        {t("agent.emptyContext", {
          instances: t("agent.emptyContextInstances", { count: instanceCount }),
          tools: t("agent.emptyContextTools", { count: toolCount }),
        })}
      </p>
    </Empty>
  );
}
