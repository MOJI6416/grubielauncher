import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { accountAtom, settingsAtom } from "@renderer/stores/atoms";
import { Hint } from "@renderer/components/Hint";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import {
  modTranslationLocale,
  ModTranslationStatus,
  supportsModTranslation,
} from "@/types/ModTranslations";
import { countFeature } from "@renderer/features/usage/usage";

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

export function canTranslateMods(
  launcherLang: string | undefined,
  mcVersion: string,
  loader: string,
): boolean {
  return (
    !!modTranslationLocale(launcherLang) &&
    supportsModTranslation(mcVersion) &&
    loader !== "vanilla"
  );
}

export function ModTranslationRow({
  versionPath,
  mcVersion,
  loader,
  disabled,
}: {
  versionPath: string;
  mcVersion: string;
  loader: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const account = useAtomValue(accountAtom);
  const [status, setStatus] = useState<ModTranslationStatus | null>(null);
  const [switching, setSwitching] = useState(false);
  const visible = canTranslateMods(settings.lang, mcVersion, loader);
  const token = account?.accessToken || undefined;

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, versionPath, settings.lang, token]);

  const inProgress =
    !!status?.enabled &&
    (status.pending > 0 || ACTIVE_STAGES.has(status.stage));

  useEffect(() => {
    if (!visible || !inProgress) return;
    const timer = window.setInterval(() => {
      void api.modTranslations
        .status(versionPath, settings.lang, token)
        .then(setStatus)
        .catch(ignoreFailure);
    }, STATUS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [visible, inProgress, versionPath, settings.lang, token]);

  if (!visible) return null;

  const enabled = status?.enabled ?? false;

  const toggle = (next: boolean) => {
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
  };

  const line = describe(status, t);
  const packs = status?.packs ?? [];

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Languages
          className={cn(
            "size-4 shrink-0",
            enabled ? "text-info" : "text-faint",
          )}
        />
        <Hint content={t("modTranslations.title")} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-sm">
            {t("modTranslations.title")}
          </span>
        </Hint>
        <Switch
          aria-label={t("modTranslations.title")}
          disabled={disabled || switching || !status}
          checked={enabled}
          onCheckedChange={toggle}
        />
      </div>
      <div className="flex items-center gap-3 pl-6">
        <Hint
          variant="text"
          truncatedOnly={packs.length === 0}
          content={
            packs.length === 0 ? (
              line.text
            ) : (
              <div className="flex max-w-80 flex-col gap-1">
                <span>{line.text}</span>
                <span className="text-faint">
                  {t("modTranslations.packsHint")}
                </span>
                {packs.map((pack) => (
                  <span key={pack.key}>
                    {t("modTranslations.packLine", {
                      title: pack.title,
                      author: pack.author,
                      license: pack.license,
                    })}
                  </span>
                ))}
              </div>
            )
          }
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-2xs",
              line.tone === "warning" ? "text-warning" : "text-faint",
            )}
          >
            {line.text}
          </span>
        </Hint>
      </div>
    </div>
  );
}

function describe(
  status: ModTranslationStatus | null,
  t: (key: string, options?: Record<string, unknown>) => string,
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
  if (status.error) {
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
