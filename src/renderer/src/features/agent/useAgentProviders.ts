import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AiProvidersState } from "@/types/Agent";
import { showFailureToast } from "@renderer/utilities/failures";

const api = window.api;

export function useAgentProviders() {
  const { t } = useTranslation();
  const [state, setState] = useState<AiProvidersState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const next = await api.agent.providers.list();
      setLoadFailed(next === null);
      if (next) setState(next);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const select = useCallback(
    async (id: string) => {
      let next: AiProvidersState | null = null;
      let failure: unknown;
      try {
        next = await api.agent.providers.select(id);
      } catch (error) {
        failure = error;
      }

      if (!next) {
        showFailureToast(t("agent.providers.selectFailed"), failure, {
          channels: ["agent:providers:select"],
        });
        return;
      }

      setState(next);
    },
    [t],
  );

  const remove = useCallback(
    async (id: string) => {
      let next: AiProvidersState | null = null;
      let failure: unknown;
      try {
        next = await api.agent.providers.remove(id);
      } catch (error) {
        failure = error;
      }

      if (!next) {
        showFailureToast(t("agent.providers.deleteFailed"), failure, {
          channels: ["agent:providers:delete"],
        });
        return;
      }

      setState(next);
    },
    [t],
  );

  return { state, setState, loadFailed, load, select, remove };
}
