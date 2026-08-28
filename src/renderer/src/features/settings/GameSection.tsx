import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { CircleAlert, Info, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { versionsAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { instanceKey } from "@renderer/features/instances/selectors";
import { countOverrides } from "@/shared/instanceSettings";
import { normalizeWorldBackupKeep } from "@/types/WorldBackup";
import type { TSettings } from "@/types/Settings";
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import {
  MEMORY_MIN_MB,
  MEMORY_STEP_MB,
  activePresetId,
  clampMemory,
  maxMemoryMb,
  memoryAdvice,
  memoryArgsPreview,
  memoryPresets,
  memoryTicks,
  tickOffset,
} from "./memory";
import type { SettingsEntryId } from "./catalog";

const KEEP_OPTIONS = [1, 3, 5, 10, 20];

const ADVICE_STYLE = {
  info: { icon: Info, tone: "text-faint" },
  warning: { icon: TriangleAlert, tone: "text-warning" },
  danger: { icon: CircleAlert, tone: "text-destructive" },
} as const;

function formatGb(mb: number): string {
  return (mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1);
}

export function GameSection({
  settings,
  commit,
  totalMemoryMb,
  visible,
  query,
  isChanged,
  reset,
}: {
  settings: TSettings;
  commit: (patch: Partial<TSettings>) => void;
  totalMemoryMb: number;
  visible: (id: SettingsEntryId) => boolean;
  query: string;
  isChanged: (id: SettingsEntryId) => boolean;
  reset: (id: SettingsEntryId) => void;
}) {
  const { t } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const [draft, setDraft] = useState(settings.xmx);

  useEffect(() => setDraft(settings.xmx), [settings.xmx]);

  const max = maxMemoryMb(totalMemoryMb);
  const presets = memoryPresets(totalMemoryMb);
  const ticks = memoryTicks(totalMemoryMb);
  const active = activePresetId(draft, totalMemoryMb);
  const advice = memoryAdvice(draft, totalMemoryMb, settings.optimizedJvm);
  const overriding = versions.filter(
    (version) => countOverrides(version.version.overrides) > 0,
  );

  const applyMemory = (value: number) => {
    const next = clampMemory(value, totalMemoryMb);
    setDraft(next);
    if (next !== settings.xmx) commit({ xmx: next });
  };

  const Advice = advice ? ADVICE_STYLE[advice.tone].icon : Info;
  const gameShare = totalMemoryMb
    ? Math.min(100, Math.round((draft / totalMemoryMb) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup
        title={t("settings.game.launchTitle")}
        hint={t("settings.game.defaultsNote")}
      >
        {visible("memory") && (
          <SettingRow
            title={t("settings.memory")}
            description={t("settings.game.memoryDescription")}
            query={query}
            changed={isChanged("memory")}
            onReset={() => reset("memory")}
            control={
              <span className="font-mono text-lg tabular-nums text-foreground">
                {formatGb(draft)}
                <span className="ml-1 text-xs text-faint">
                  {t("settings.game.gb")}
                </span>
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyMemory(preset.mb)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors",
                    active === preset.id
                      ? "border-primary/50 bg-primary-soft text-foreground"
                      : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`settings.game.presets.${preset.id}`)}
                  <span className="font-mono tabular-nums text-faint">
                    {formatGb(preset.mb)}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative mt-3">
              <Slider
                min={MEMORY_MIN_MB}
                max={max}
                step={MEMORY_STEP_MB}
                value={[Math.min(draft, max)]}
                onValueChange={([value]) => {
                  if (typeof value === "number") setDraft(value);
                }}
                onValueCommit={([value]) => {
                  if (typeof value === "number") applyMemory(value);
                }}
                aria-label={t("settings.memory")}
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5">
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    className={cn(
                      "absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
                      tick <= draft ? "bg-primary-foreground/60" : "bg-faint",
                    )}
                    style={{ left: `${tickOffset(tick, totalMemoryMb)}%` }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[0.65rem] tabular-nums text-faint">
                <span>1 {t("settings.game.gb")}</span>
                <span>
                  {formatGb(max)} {t("settings.game.gb")}
                </span>
              </div>
            </div>

            {totalMemoryMb > 0 && (
              <div className="mt-3 rounded-lg bg-surface-2 px-2.5 py-2">
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <span
                    className="h-full bg-primary"
                    style={{ width: `${gameShare}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[0.7rem]">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-1.5 rounded-[2px] bg-primary" />
                    {t("settings.game.splitGame")}
                    <span className="font-mono tabular-nums text-faint">
                      {formatGb(draft)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-1.5 rounded-[2px] bg-surface-3" />
                    {t("settings.game.splitSystem")}
                    <span className="font-mono tabular-nums text-faint">
                      {formatGb(Math.max(0, totalMemoryMb - draft))}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {advice && (
              <p
                className={cn(
                  "mt-2.5 flex items-start gap-1.5 text-xs leading-snug",
                  ADVICE_STYLE[advice.tone].tone,
                )}
              >
                <Advice className="mt-px size-3.5 shrink-0" />
                <span>
                  {t(`settings.game.advice.${advice.key}`, {
                    free: formatGb(advice.headroomMb),
                  })}
                </span>
              </p>
            )}

            <p className="mt-2 font-mono text-[0.65rem] text-faint">
              {memoryArgsPreview(draft, settings.optimizedJvm)}
            </p>
          </SettingRow>
        )}

        {visible("optimizedJvm") && (
          <SettingRow
            htmlFor="settings-optimized-jvm"
            title={t("settings.optimizedJvm")}
            description={t("settings.game.optimizedJvmDescription")}
            query={query}
            changed={isChanged("optimizedJvm")}
            onReset={() => reset("optimizedJvm")}
            control={
              <Switch
                id="settings-optimized-jvm"
                checked={settings.optimizedJvm}
                onCheckedChange={(value) => commit({ optimizedJvm: value })}
              />
            }
          />
        )}

        {visible("highPriority") && (
          <SettingRow
            htmlFor="settings-high-priority"
            title={t("settings.highPriority")}
            description={t("settings.highPriorityDescription")}
            query={query}
            changed={isChanged("highPriority")}
            onReset={() => reset("highPriority")}
            control={
              <Switch
                id="settings-high-priority"
                checked={settings.highPriority}
                onCheckedChange={(value) => commit({ highPriority: value })}
              />
            }
          />
        )}
      </SettingsGroup>

      {(visible("autoWorldBackup") || visible("worldBackupKeep")) && (
        <SettingsGroup
          title={t("settings.game.worldsTitle")}
          hint={t("settings.worlds.hint")}
        >
          {visible("autoWorldBackup") && (
            <SettingRow
              htmlFor="settings-auto-backup"
              title={t("settings.autoWorldBackup")}
              description={t("settings.autoWorldBackupDescription")}
              query={query}
              changed={isChanged("autoWorldBackup")}
              onReset={() => reset("autoWorldBackup")}
              control={
                <Switch
                  id="settings-auto-backup"
                  checked={settings.autoWorldBackup}
                  onCheckedChange={(value) => commit({ autoWorldBackup: value })}
                />
              }
            />
          )}

          {visible("worldBackupKeep") && (
            <SettingRow
              title={t("settings.worldBackupKeep")}
              description={t("settings.worldBackupKeepDescription")}
              query={query}
              disabled={!settings.autoWorldBackup}
              changed={isChanged("worldBackupKeep")}
              onReset={() => reset("worldBackupKeep")}
              control={
                <Select
                  value={String(settings.worldBackupKeep)}
                  disabled={!settings.autoWorldBackup}
                  onValueChange={(value) =>
                    commit({ worldBackupKeep: normalizeWorldBackupKeep(value) })
                  }
                >
                  <SelectTrigger size="sm" className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KEEP_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
          )}
        </SettingsGroup>
      )}

      {overriding.length > 0 && visible("memory") && (
        <SettingsGroup
          title={t("settings.game.overridesTitle")}
          hint={t("settings.game.overridesHint")}
        >
          {overriding.slice(0, 4).map((version) => (
            <button
              key={instanceKey(version)}
              type="button"
              onClick={() =>
                navigate({
                  name: "instance",
                  id: instanceKey(version),
                  tab: "settings",
                })
              }
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-surface-3"
            >
              <SlidersHorizontal className="size-3.5 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {version.version.name}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {version.version.overrides?.xmx
                  ? `${formatGb(version.version.overrides.xmx)} ${t("settings.game.gb")}`
                  : t("settings.game.overridesOther")}
              </span>
            </button>
          ))}
        </SettingsGroup>
      )}
    </div>
  );
}
