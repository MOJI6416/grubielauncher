import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { LAUNCHER_RELEASES_SIZE } from "@/shared/config";
import { networkAtom } from "@renderer/stores/atoms";

const api = window.api;

const HISTORY_STALE_MS = 30 * 60 * 1000;

export function useReleaseHistory(enabled: boolean) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const isBackendOnline = useAtomValue(networkAtom);

  const query = useQuery({
    queryKey: ["launcher-releases", locale],
    enabled: enabled && isBackendOnline,
    staleTime: HISTORY_STALE_MS,
    retry: false,
    queryFn: async () => await api.backend.getLauncherReleases(
      locale,
      LAUNCHER_RELEASES_SIZE,
    ),
  });

  return {
    releases: query.data?.items ?? [],
    isLoading: query.isPending && enabled && isBackendOnline,
    isUnavailable:
      !isBackendOnline || (!query.isPending && !query.data?.items?.length),
    refetch: query.refetch,
  };
}
