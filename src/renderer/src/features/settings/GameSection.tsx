import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { SlidersHorizontal } from "lucide-react";
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
import { Hint } from "@renderer/components/Hint";
import { instanceKey } from "@renderer/features/instances/selectors";
import { countOverrides } from "@/shared/instanceSettings";
import { normalizeWorldBackupKeep } from "@/types/WorldBackup";
import type { TSettings } from "@/types/Settings";
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import { MemoryControl } from "./MemoryControl";
import type { SettingsEntryId } from "./catalog";
import { JavaSettingsGroup } from "@renderer/features/java/JavaSettingsGroup";
import { JvmFlagsInfo } from "@renderer/components/JvmFlagsInfo";
import { PLATFORM } from "@renderer/utilities/platform";
import { supportsGpuPreference } from "@/shared/gpuPreference";
import {
  GpuPreferenceControl,
  LinuxLaunchFields,
  useLinuxLaunchTools,
} from "@renderer/features/launch/LaunchSettingsControls";

const KEEP_OPTIONS = [1, 3, 5, 10, 20];

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
  const isLinux = PLATFORM === "linux";
  const linuxTools = useLinuxLaunchTools(isLinux);

  const overriding = versions.filter(
    (version) => countOverrides(version.version.overrides) > 0,
  );

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
          >
            <MemoryControl
              value={settings.xmx}
              totalMemoryMb={totalMemoryMb}
              optimizedJvm={settings.optimizedJvm}
              onChange={(xmx) => commit({ xmx })}
            />
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
          >
            <JvmFlagsInfo />
          </SettingRow>
        )}

        {visible("highPriority") && PLATFORM === "win32" && (
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

        {visible("gpuPreference") && supportsGpuPreference(PLATFORM) && (
          <SettingRow
            title={t("launchSettings.gpu.title")}
            description={t("launchSettings.gpu.description")}
            query={query}
            changed={isChanged("gpuPreference")}
            onReset={() => reset("gpuPreference")}
            control={
              <GpuPreferenceControl
                value={settings.gpuPreference}
                onChange={(gpuPreference) => commit({ gpuPreference })}
              />
            }
          />
        )}
      </SettingsGroup>

      {isLinux &&
        (visible("linuxTools") ||
          visible("wrapperCommand") ||
          visible("launchEnv") ||
          visible("launchHooks")) && (
          <SettingsGroup
            title={t("launchSettings.linux.title")}
            hint={t("launchSettings.linux.hint")}
          >
            <div className="px-3.5 py-3">
              <LinuxLaunchFields
                idPrefix="settings-linux"
                values={settings}
                tools={linuxTools}
                onChange={(patch) => commit(patch)}
              />
            </div>
          </SettingsGroup>
        )}

      {visible("java") && <JavaSettingsGroup query={query} />}

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
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-row-hover"
            >
              <SlidersHorizontal className="size-3.5 shrink-0 text-faint" />
              <Hint content={version.version.name} variant="text" truncatedOnly>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {version.version.name}
                </span>
              </Hint>
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
