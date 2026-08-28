import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { settingsAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { showFailureToast } from "@renderer/utilities/failures";
import { changeAppLanguage } from "@renderer/i18n";
import type { TSettings } from "@/types/Settings";

const api = window.api;

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

const SAVED_PULSE_MS = 1600;

export function useSettingsWriter() {
  const settings = useAtomValue(settingsAtom);
  const { t } = useTranslation();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pulseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(0);

  useEffect(
    () => () => {
      if (pulseRef.current) clearTimeout(pulseRef.current);
    },
    [],
  );

  const commit = useCallback(
    async (patch: Partial<TSettings>) => {
      if (Object.keys(patch).length === 0) return;

      pendingRef.current += 1;
      setStatus("saving");

      try {
        await patchSettings(patch);

        if (patch.downloadSource) {
          await api.mirror.setSource(patch.downloadSource);
        }
        if (patch.lang) {
          await changeAppLanguage(patch.lang);
        }

        pendingRef.current -= 1;
        if (pendingRef.current > 0) return;

        setStatus("saved");
        if (pulseRef.current) clearTimeout(pulseRef.current);
        pulseRef.current = setTimeout(() => setStatus("idle"), SAVED_PULSE_MS);
      } catch (error) {
        pendingRef.current -= 1;
        setStatus("failed");
        showFailureToast(t("settings.saveFailed"), error, {
          channels: ["fs:writeJSON"],
        });
      }
    },
    [t],
  );

  return { settings, status, commit };
}
