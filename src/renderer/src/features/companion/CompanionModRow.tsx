import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Puzzle } from "lucide-react";
import type { CompanionSupport } from "@/shared/companion";
import { buildCompanionUrl } from "@/shared/siteLinks";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { Version } from "@renderer/classes/Version";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { countFeature } from "@renderer/features/usage/usage";
import { bumpInstanceDataRevision } from "@renderer/features/instances/instanceRevision";

const api = window.api;

const supportCache = new Map<string, Promise<CompanionSupport>>();

export function companionSupportOf(
  minecraft: string,
  loader: string,
): Promise<CompanionSupport> {
  const key = `${loader}:${minecraft}`;
  let cached = supportCache.get(key);
  if (!cached) {
    cached = api.companion.support(minecraft, loader).catch(() => {
      supportCache.delete(key);
      return { supported: false, version: null };
    });
    supportCache.set(key, cached);
  }
  return cached;
}

export function CompanionModRow({
  instance,
  disabled,
}: {
  instance: Version;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const conf = instance.version;
  const [support, setSupport] = useState<CompanionSupport | null>(null);
  const [enabled, setEnabled] = useState(conf.companionMod === true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(conf.companionMod === true);
  }, [conf, conf.companionMod]);

  useEffect(() => {
    let cancelled = false;
    void companionSupportOf(conf.version.id, conf.loader.name).then((next) => {
      if (!cancelled) setSupport(next);
    });
    return () => {
      cancelled = true;
    };
  }, [conf.version.id, conf.loader.name]);

  if (!support?.supported) return null;

  const toggle = async (next: boolean) => {
    setBusy(true);
    const previous = conf.companionMod;
    conf.companionMod = next || undefined;
    setEnabled(next);
    try {
      if (!(await instance.save())) throw new Error("version:save");
      await api.companion
        .sync(instance.versionPath, next, conf.version.id, conf.loader.name)
        .catch(ignoreFailure);
      if (next) countFeature("companion.enable");
      bumpInstanceDataRevision();
    } catch (error) {
      conf.companionMod = previous;
      setEnabled(previous === true);
      showFailureToast(t("companion.toggleFailed"), error, {
        channels: ["version:save"],
      });
    } finally {
      setBusy(false);
    }
  };

  const hint = enabled
    ? t("companion.hintOn", { version: support.version ?? "" })
    : t("companion.hintOff");

  const openSite = () => {
    countFeature("companion.site");
    void api.shell
      .openExternal(buildCompanionUrl(i18n.resolvedLanguage))
      .catch((error) =>
        showFailureToast(t("settings.about.openLinkFailed"), error, {
          channels: ["shell:openExternal"],
        }),
      );
  };

  return (
    <div className="flex h-9 min-w-0 items-center gap-2 border-t border-border/60 px-3">
      <Puzzle
        className={cn("size-3.5 shrink-0", enabled ? "text-info" : "text-faint")}
      />
      <span className="shrink-0 text-xs font-medium">{t("companion.title")}</span>
      <Hint content={hint} variant="text" truncatedOnly>
        <span className="min-w-0 flex-1 truncate text-2xs text-faint">{hint}</span>
      </Hint>
      <Hint content={t("companion.learnMore")}>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          aria-label={t("companion.learnMore")}
          onClick={openSite}
        >
          <ExternalLink />
        </Button>
      </Hint>
      <Switch
        aria-label={t("companion.toggle")}
        disabled={disabled || busy}
        checked={enabled}
        onCheckedChange={(value) => void toggle(value)}
      />
    </div>
  );
}
