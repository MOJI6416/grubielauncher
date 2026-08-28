import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import type { ILauncherReleaseNote } from "@/types/LauncherRelease";
import { networkAtom } from "@renderer/stores/atoms";
import { currentReleaseAtom, loadCurrentRelease } from "./whatsNewStore";

export function useCurrentRelease(): ILauncherReleaseNote | null {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const isBackendOnline = useAtomValue(networkAtom);
  const release = useAtomValue(currentReleaseAtom);

  useEffect(() => {
    if (!isBackendOnline) return;
    loadCurrentRelease(locale);
  }, [locale, isBackendOnline]);

  return release;
}
