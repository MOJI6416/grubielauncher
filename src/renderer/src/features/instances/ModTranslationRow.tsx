import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settingsAtom } from "@renderer/stores/atoms";
import { Hint } from "@renderer/components/Hint";
import {
  modTranslationLocale,
  supportsModTranslation,
} from "@/types/ModTranslations";
import {
  describeTranslation,
  useModTranslationStatus,
} from "./useModTranslationStatus";

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
  onOpen,
}: {
  versionPath: string;
  mcVersion: string;
  loader: string;
  disabled?: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const visible = canTranslateMods(settings.lang, mcVersion, loader);
  const { status, switching, toggle } = useModTranslationStatus(
    versionPath,
    visible,
  );

  if (!visible) return null;

  const enabled = status?.enabled ?? false;
  const line = describeTranslation(status, t);

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
      <div className="flex items-center gap-2 pl-6">
        <Hint variant="text" truncatedOnly content={line.text}>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-2xs",
              line.tone === "warning" ? "text-warning" : "text-faint",
            )}
          >
            {line.text}
          </span>
        </Hint>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          onClick={onOpen}
        >
          {t("modTranslations.panel.open")}
        </Button>
      </div>
    </div>
  );
}
