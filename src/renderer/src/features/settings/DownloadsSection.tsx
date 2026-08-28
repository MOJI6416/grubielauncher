import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { Activity, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  mirrorModeAtom,
  openConnectivityCheck,
} from "@renderer/features/install/installUi";
import { resolveMirrorMode, type MirrorMode } from "@/shared/mirrorMode";
import type { DownloadSource, TSettings } from "@/types/Settings";
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";

const api = window.api;

const SOURCES: DownloadSource[] = ["auto", "official", "mirror"];

const ROUTES = [
  { id: "minecraft", host: "piston-meta.mojang.com", mirrored: true },
  { id: "java", host: "api.adoptium.net", mirrored: true },
  {
    id: "loaders",
    host: "maven.neoforged.net · meta.fabricmc.net",
    mirrored: true,
  },
  { id: "mods", host: "cdn.modrinth.com · forgecdn.net", mirrored: true },
  { id: "account", host: "api.grubielauncher.com", mirrored: false },
] as const;

const MODE_TONE: Record<MirrorMode, string> = {
  official: "text-success",
  "official-first": "text-success",
  mirror: "text-foreground",
  "mirror-cooldown": "text-warning",
};

export function DownloadsSection({
  settings,
  commit,
  visible,
  query,
  isChanged,
  reset,
}: {
  settings: TSettings;
  commit: (patch: Partial<TSettings>) => void;
  visible: (id: SettingsEntryId) => boolean;
  query: string;
  isChanged: (id: SettingsEntryId) => boolean;
  reset: (id: SettingsEntryId) => void;
}) {
  const { t } = useTranslation();
  const cachedMode = useAtomValue(mirrorModeAtom);
  const [mode, setMode] = useState<MirrorMode | null>(cachedMode);
  const [isProbing, setProbing] = useState(false);
  const [limit, setLimit] = useState(settings.downloadLimit);

  useEffect(() => setLimit(settings.downloadLimit), [settings.downloadLimit]);

  useEffect(() => {
    let cancelled = false;
    setProbing(true);

    void api.mirror
      .getState()
      .then((state) => {
        if (!cancelled) setMode(resolveMirrorMode(state));
      })
      .finally(() => {
        if (!cancelled) setProbing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [settings.downloadSource]);

  const usesMirror = mode === "mirror";

  return (
    <div className="flex flex-col gap-4">
      {(visible("downloadSource") ||
        visible("downloadLimit") ||
        visible("mirrorRouting")) && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3">
            {isProbing ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <Globe className="size-4 text-muted-foreground" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm font-medium",
                mode ? MODE_TONE[mode] : "text-muted-foreground",
              )}
            >
              {mode
                ? t(`mirror.modes.${mode}.label`)
                : t("settings.downloads.mirrorUnknown")}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {mode
                ? t(`mirror.modes.${mode}.hint`)
                : t("settings.downloads.mirrorUnknownHint")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={openConnectivityCheck}
          >
            <Activity className="size-3.5" />
            {t("settings.connectivity.run")}
          </Button>
        </div>
      )}

      <SettingsGroup title={t("settings.sections.downloads")}>
        {visible("downloadSource") && (
          <SettingRow
            title={t("settings.downloadSource")}
            description={t("settings.downloads.sourceDescription")}
            query={query}
            changed={isChanged("downloadSource")}
            onReset={() => reset("downloadSource")}
          >
            <div className="grid grid-cols-3 gap-2">
              {SOURCES.map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => commit({ downloadSource: source })}
                  aria-pressed={settings.downloadSource === source}
                  className={cn(
                    "flex h-16 flex-col rounded-lg border px-2.5 py-2 text-left transition-colors",
                    settings.downloadSource === source
                      ? "border-primary/50 bg-primary-soft"
                      : "border-border bg-surface-2 hover:bg-surface-3",
                  )}
                >
                  <span className="block text-xs font-medium text-foreground">
                    {t(`settings.downloadSourceOptions.${source}`)}
                  </span>
                  <span className="mt-0.5 block text-[0.7rem] leading-snug text-faint">
                    {t(`settings.downloads.sourceHints.${source}`)}
                  </span>
                </button>
              ))}
            </div>
          </SettingRow>
        )}

        {visible("downloadLimit") && (
          <SettingRow
            title={t("settings.downloadLimit")}
            description={t("settings.downloads.limitDescription")}
            query={query}
            changed={isChanged("downloadLimit")}
            onReset={() => reset("downloadLimit")}
            control={
              <span className="font-mono text-sm tabular-nums text-foreground">
                {limit}
              </span>
            }
          >
            <Slider
              min={1}
              max={16}
              step={1}
              value={[limit]}
              onValueChange={([value]) => {
                if (typeof value === "number") setLimit(value);
              }}
              onValueCommit={([value]) => {
                if (typeof value === "number") commit({ downloadLimit: value });
              }}
              aria-label={t("settings.downloadLimit")}
            />
            <div className="mt-1.5 flex justify-between font-mono text-[0.65rem] tabular-nums text-faint">
              <span>1</span>
              <span>16</span>
            </div>
          </SettingRow>
        )}
      </SettingsGroup>

      {visible("mirrorRouting") && (
        <SettingsGroup
          title={t("settings.downloads.routingTitle")}
          hint={t("settings.downloads.routingHint")}
        >
          {ROUTES.map((route) => {
            const viaMirror = route.mirrored && usesMirror;
            return (
              <div
                key={route.id}
                className="flex items-center gap-3 px-3.5 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {t(`settings.downloads.routes.${route.id}`)}
                  </span>
                  <span className="block truncate font-mono text-[0.65rem] text-faint">
                    {route.host}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    route.mirrored
                      ? viaMirror
                        ? "text-foreground"
                        : "text-muted-foreground"
                      : "text-faint",
                  )}
                >
                  {route.mirrored
                    ? viaMirror
                      ? t("settings.downloadSourceOptions.mirror")
                      : t("settings.downloadSourceOptions.official")
                    : t("settings.downloads.routeDirect")}
                </span>
              </div>
            );
          })}
        </SettingsGroup>
      )}
    </div>
  );
}
