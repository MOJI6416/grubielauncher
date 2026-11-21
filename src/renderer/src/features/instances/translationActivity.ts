import { useEffect, useRef } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { accountAtom, settingsAtom, versionsAtom } from "@renderer/stores/atoms";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import type { ModTranslationStatus } from "@/types/ModTranslations";
import { canTranslateMods } from "./ModTranslationRow";

const api = window.api;

export const translationStatusesAtom = atom<Record<string, ModTranslationStatus>>({});
export const translationPanelRequestAtom = atom<string | null>(null);

const WORKING_STAGES = new Set<ModTranslationStatus["stage"]>(["scanning", "packs", "building"]);

export function isTranslationActive(status: ModTranslationStatus): boolean {
  if (!status.enabled) return false;
  if (status.pending > 0 || WORKING_STAGES.has(status.stage)) return true;
  return status.stage === "translating" && !status.updatedAt;
}

export function translationPercent(status: ModTranslationStatus): number | null {
  let strings = 0;
  let translated = 0;
  for (const item of status.items ?? []) {
    strings += item.strings;
    translated += item.translated;
  }
  return strings > 0 ? Math.min(100, Math.round((translated / strings) * 100)) : null;
}

export function useTranslationActivityFeed(): void {
  const setStatuses = useSetAtom(translationStatusesAtom);
  const versions = useAtomValue(versionsAtom);
  const settings = useAtomValue(settingsAtom);
  const account = useAtomValue(accountAtom);
  const asked = useRef(new Set<string>());
  const token = account?.accessToken || undefined;

  useEffect(
    () =>
      api.modTranslations.onStatus((next) => {
        setStatuses((current) => ({ ...current, [next.versionPath]: next }));
      }),
    [setStatuses],
  );

  useEffect(() => {
    for (const version of versions) {
      const conf = version.version;
      if (asked.current.has(version.versionPath)) continue;
      if (!canTranslateMods(settings.lang, conf.version.id, conf.loader.name)) continue;
      asked.current.add(version.versionPath);
      void api.modTranslations
        .status(version.versionPath, settings.lang, token)
        .then((next) =>
          setStatuses((current) =>
            current[next.versionPath] ? current : { ...current, [next.versionPath]: next },
          ),
        )
        .catch(ignoreFailure);
    }
  }, [versions, settings.lang, token, setStatuses]);
}
