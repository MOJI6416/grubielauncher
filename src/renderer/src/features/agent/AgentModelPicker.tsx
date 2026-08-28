import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAtom, useSetAtom } from "jotai";
import { TriangleAlert } from "lucide-react";
import { AiProviderProfile } from "@/types/Agent";
import {
  VirtualizedSelect,
  VirtualizedSelectOption,
} from "@/components/ui/virtualized-select";
import { Hint } from "@renderer/components/Hint";
import {
  agentModelAtom,
  agentModelsAtom,
  agentProvidersAtom,
} from "@renderer/agent/store";

const api = window.api;

function formatContext(length?: number): string | undefined {
  if (!length || length <= 0) return undefined;
  if (length >= 1000) return `${Math.round(length / 1000)}k`;

  return String(length);
}

export function AgentModelPicker({
  provider,
  disabled,
}: {
  provider: AiProviderProfile;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [models, setModels] = useAtom(agentModelsAtom);
  const [model, setModel] = useAtom(agentModelAtom);
  const setProviders = useSetAtom(agentProvidersAtom);
  const available = models[provider.id];

  useEffect(() => {
    setModel(provider.model);
  }, [provider.id, provider.model, setModel]);

  useEffect(() => {
    if (models[provider.id]) return;

    void api.agent.models.list(provider.id).then((list) => {
      if (!list?.length) return;
      setModels((current) => ({ ...current, [provider.id]: list }));
    });
  }, [models, provider.id, setModels]);

  const options = useMemo<VirtualizedSelectOption[]>(() => {
    const list = available ?? [];
    const known = list.some((entry) => entry.id === model);

    const extra: VirtualizedSelectOption[] =
      model && !known ? [{ value: model, label: model }] : [];

    return [
      ...extra,
      ...list.map((entry) => ({
        value: entry.id,
        label: entry.label,
        secondaryLabel: formatContext(entry.contextLength),
        badge: entry.supportsTools
          ? undefined
          : {
              label: t("agent.providers.noTools"),
              className: "bg-destructive/15 text-destructive",
            },
      })),
    ];
  }, [available, model, t]);

  const selected = available?.find((entry) => entry.id === model);
  const toolless = selected ? !selected.supportsTools : false;

  return (
    <span
      id="agent-model-picker"
      className="flex shrink-0 items-center gap-1.5"
    >
      <VirtualizedSelect
        value={model ?? ""}
        size="sm"
        disabled={disabled}
        className="w-44 border-0 bg-surface-2 px-2 text-xs font-normal"
        onValueChange={(value) => {
          setModel(value);
          void api.agent.providers
            .save({
              id: provider.id,
              label: provider.label,
              baseUrl: provider.baseUrl,
              model: value,
            })
            .then((next) => {
              if (next?.providers.length) setProviders(next);
            });
        }}
        options={options}
        placeholder={t("agent.providers.modelPlaceholder")}
        searchPlaceholder={t("agent.providers.modelSearch")}
        emptyText={t("agent.providers.modelEmpty")}
        aria-label={t("agent.providers.model")}
      />
      {toolless && (
        <Hint content={t("agent.providers.noToolsWarning")}>
          <span className="flex shrink-0 items-center gap-1 text-[0.65rem] text-destructive">
            <TriangleAlert className="size-3" />
            {t("agent.providers.noTools")}
          </span>
        </Hint>
      )}
    </span>
  );
}
