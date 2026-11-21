import { useCallback, useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { accountAtom, settingsAtom } from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import type { ModTranslationStatus } from "@/types/ModTranslations";
import { countFeature } from "@renderer/features/usage/usage";
import { formatDuration } from "@renderer/utilities/duration";

const api = window.api;

const STATUS_REFRESH_MS = 10_000;

const ACTIVE_STAGES = new Set<ModTranslationStatus["stage"]>([
  "scanning",
  "packs",
  "translating",
  "building",
  "waiting",
]);

const ERROR_KEYS: Record<string, string> = {
  unavailable: "modTranslations.errorUnavailable",
  network: "modTranslations.errorNetwork",
  quota: "modTranslations.errorQuota",
};

export function useModTranslationStatus(versionPath: string, active: boolean) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const account = useAtomValue(accountAtom);
  const [status, setStatus] = useState<ModTranslationStatus | null>(null);
  const [switching, setSwitching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const token = account?.accessToken || undefined;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const unsubscribe = api.modTranslations.onStatus((next) => {
      if (!cancelled && next.versionPath === versionPath) setStatus(next);
    });
    void api.modTranslations
      .status(versionPath, settings.lang, token)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [active, versionPath, settings.lang, token]);

  const inProgress =
    !!status?.enabled &&
    (status.pending > 0 || ACTIVE_STAGES.has(status.stage));

  useEffect(() => {
    if (!active || !inProgress) return;
    const timer = window.setInterval(() => {
      void api.modTranslations
        .status(versionPath, settings.lang, token)
        .then(setStatus)
        .catch(ignoreFailure);
    }, STATUS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [active, inProgress, versionPath, settings.lang, token]);

  const toggle = useCallback(
    (next: boolean) => {
      setSwitching(true);
      if (next) countFeature("mods.autoTranslate");
      void api.modTranslations
        .setEnabled(versionPath, next, settings.lang, token)
        .then(setStatus)
        .catch((error) =>
          showFailureToast(t("modTranslations.toggleFailed"), error, {
            channels: ["modTranslations:setEnabled"],
          }),
        )
        .finally(() => setSwitching(false));
    },
    [versionPath, settings.lang, token, t],
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    void api.modTranslations
      .status(versionPath, settings.lang, token)
      .then(setStatus)
      .catch((error) =>
        showFailureToast(t("modTranslations.errorInternal"), error, {
          channels: ["modTranslations:status"],
        }),
      )
      .finally(() => setRefreshing(false));
  }, [versionPath, settings.lang, token, t]);

  return {
    status,
    switching,
    refreshing,
    busy: !!status?.enabled && ACTIVE_STAGES.has(status.stage) && status.stage !== "waiting",
    toggle,
    refresh,
  };
}

export function describeTranslation(
  status: ModTranslationStatus | null,
  t: TFunction,
): { text: string; tone: "muted" | "warning" } {
  if (!status || !status.enabled) {
    return { text: t("modTranslations.hintOff"), tone: "muted" };
  }

  switch (status.stage) {
    case "scanning":
      return {
        text: t("modTranslations.scanning", {
          done: status.progress?.done ?? 0,
          total: status.progress?.total ?? status.mods,
        }),
        tone: "muted",
      };
    case "packs":
      return { text: t("modTranslations.packs"), tone: "muted" };
    case "translating":
      return { text: t("modTranslations.translating"), tone: "muted" };
    case "building":
      return { text: t("modTranslations.building"), tone: "muted" };
    case "deferred":
      return { text: t("modTranslations.deferred"), tone: "muted" };
  }

  const parts: string[] = [];
  if (status.packs.length > 0) {
    parts.push(t("modTranslations.packsCount", { count: status.packs.length }));
  }
  if (status.translated > 0) {
    parts.push(t("modTranslations.aiCount", { count: status.translated }));
  }
  if (status.pending > 0) {
    parts.push(t("modTranslations.waiting", { count: status.pending }));
  }
  if (status.needsAccount) parts.push(t("modTranslations.needsAccount"));

  const errorKey = status.error ? ERROR_KEYS[status.error] : null;
  if (status.error === "quota" && status.retryAt) {
    const seconds = Math.max(60, Math.round((status.retryAt - Date.now()) / 1000));
    parts.unshift(t("modTranslations.errorQuotaUntil", { time: formatDuration(seconds) }));
  } else if (status.error) {
    parts.unshift(t(errorKey ?? "modTranslations.errorInternal"));
  }
  if (parts.length === 0) {
    parts.push(
      status.updatedAt
        ? t("modTranslations.nothing")
        : t("modTranslations.hintOff"),
    );
  }

  return {
    text: parts.join(" · "),
    tone: status.error || status.needsAccount ? "warning" : "muted",
  };
}
