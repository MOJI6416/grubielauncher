import { ReactNode } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Coffee,
  Cpu,
  Gauge,
  Languages,
  Lock,
  MemoryStick,
  Monitor,
  SquareTerminal,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TITLEBAR_HEIGHT } from "@/shared/titlebar";
import { cn } from "@/lib/utils";
import { settingsAtom } from "@renderer/stores/atoms";
import { AskAgentButton } from "@renderer/features/agent/AskAgentButton";
import { Hint } from "@renderer/components/Hint";
import {
  JAVA_STATUS_TONE,
  JavaPicker,
  javaStatus,
} from "@renderer/features/java/JavaPicker";
import { useJavaRuntimes } from "@renderer/features/java/useJavaRuntimes";
import {
  MemoryControl,
  useTotalMemoryMb,
} from "@renderer/features/settings/MemoryControl";
import { OPTIMIZED_GC_FLAGS } from "@/shared/jvmDefaults";
import { JvmFlagsInfo } from "@renderer/components/JvmFlagsInfo";
import {
  InstanceSettingsOverrides,
  OverridableKey,
  clearOverride,
  instanceGraphicsBackend,
  isOverridden,
  resolveInstanceSettings,
  setOverride,
} from "@/shared/instanceSettings";
import { supportsGpuPreference } from "@/shared/gpuPreference";
import { supportsGraphicsBackend } from "@/shared/graphicsBackend";
import { PLATFORM } from "@renderer/utilities/platform";
import {
  GpuPreferenceControl,
  GraphicsBackendControl,
  LinuxLaunchFields,
  useLinuxLaunchTools,
  type LinuxLaunchValues,
} from "@renderer/features/launch/LaunchSettingsControls";
import { SectionCard } from "./SectionCard";

const LINUX_KEYS = [
  "gameMode",
  "mangoHud",
  "wrapperCommand",
  "launchEnv",
  "preLaunchCommand",
  "postExitCommand",
] as const satisfies readonly (OverridableKey & keyof LinuxLaunchValues)[];

const PERFORMANCE_KEYS: readonly OverridableKey[] = [
  "xmx",
  "optimizedJvm",
  "highPriority",
  "gpuPreference",
  ...LINUX_KEYS,
];

const COMPATIBILITY_KEYS: readonly OverridableKey[] = [
  "java",
  "graphicsBackend",
];

function linuxSummary(
  values: LinuxLaunchValues,
  t: (key: string) => string,
): string {
  const parts = [
    values.gameMode ? "GameMode" : "",
    values.mangoHud ? "MangoHud" : "",
    values.wrapperCommand.trim()
      ? t("launchSettings.linux.summaryWrapper")
      : "",
    values.launchEnv.trim() ? t("launchSettings.linux.summaryEnv") : "",
    values.preLaunchCommand.trim() || values.postExitCommand.trim()
      ? t("launchSettings.linux.summaryHooks")
      : "",
  ].filter(Boolean);
  return parts.length > 0
    ? parts.join(" · ")
    : t("launchSettings.linux.summaryNone");
}

function clearKeys(
  overrides: InstanceSettingsOverrides | undefined,
  keys: readonly OverridableKey[],
): InstanceSettingsOverrides | undefined {
  let next = overrides;
  for (const key of keys) next = clearOverride(next, key);
  return next;
}

function SettingLine({
  icon: Icon,
  title,
  hint,
  overridden,
  disabled,
  onReset,
  control,
  children,
}: {
  icon: typeof Gauge;
  title: string;
  hint?: ReactNode;
  overridden: boolean;
  disabled?: boolean;
  onReset?: () => void;
  control?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const showReset = overridden && !!onReset;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <div className="flex min-h-7 items-center gap-2">
        <Icon
          className={cn(
            "size-4 shrink-0",
            overridden ? "text-info" : "text-faint",
          )}
        />
        <Hint content={title} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
        </Hint>
        {control && <div className="flex shrink-0 items-center">{control}</div>}
      </div>

      {(hint || showReset) && (
        <div className="flex min-w-0 items-center gap-2 pl-6 text-2xs">
          {typeof hint === "string" ? (
            <Hint content={hint} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-faint">{hint}</span>
            </Hint>
          ) : hint ? (
            <span className="min-w-0 flex-1 overflow-hidden text-faint">
              {hint}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          {showReset && (
            <button
              type="button"
              disabled={disabled}
              onClick={onReset}
              className="shrink-0 rounded-sm whitespace-nowrap text-info underline-offset-2 transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              {t("instanceSettings.resetToGlobal")}
            </button>
          )}
        </div>
      )}

      {children && <div className="pl-6">{children}</div>}
    </div>
  );
}

function GroupReset({
  overrides,
  keys,
  disabled,
  onChange,
}: {
  overrides: InstanceSettingsOverrides | undefined;
  keys: readonly OverridableKey[];
  disabled?: boolean;
  onChange: (next: InstanceSettingsOverrides | undefined) => void;
}) {
  const { t } = useTranslation();
  if (!keys.some((key) => isOverridden(overrides, key))) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled}
      className="h-6 px-2 text-2xs text-faint"
      onClick={() => onChange(clearKeys(overrides, keys))}
    >
      {t("instanceSettings.resetAll")}
    </Button>
  );
}

export function InstanceSettingsPanel({
  overrides,
  onChange,
  disabled,
  hint,
  requiredJavaMajor,
  minecraftVersion,
  shaderLoader = false,
  loaderCard,
  languageRow,
  profileCard,
}: {
  overrides: InstanceSettingsOverrides | undefined;
  onChange: (next: InstanceSettingsOverrides | undefined) => void;
  disabled?: boolean;
  hint?: string;
  requiredJavaMajor: number;
  minecraftVersion?: string;
  shaderLoader?: boolean;
  loaderCard?: ReactNode;
  languageRow?: ReactNode;
  profileCard?: ReactNode;
}) {
  const { t } = useTranslation();
  const global = useAtomValue(settingsAtom);
  const resolved = resolveInstanceSettings(global, overrides);
  const totalMemoryMb = useTotalMemoryMb();
  const { list: javaList } = useJavaRuntimes();
  const isLinux = PLATFORM === "linux";
  const linuxTools = useLinuxLaunchTools(isLinux);
  const linuxOverridden = LINUX_KEYS.some((key) =>
    isOverridden(overrides, key),
  );
  const showGraphics = supportsGraphicsBackend(minecraftVersion);
  const backend = instanceGraphicsBackend(overrides);
  const javaState = javaStatus(overrides?.java, requiredJavaMajor, javaList, t);
  const JavaStatusIcon = javaState?.icon;

  const set = <K extends OverridableKey>(
    key: K,
    value: InstanceSettingsOverrides[K],
  ) => onChange(setOverride(overrides, key, value));

  const reset = (key: OverridableKey) =>
    onChange(clearOverride(overrides, key));

  const patchLinux = (patch: Partial<LinuxLaunchValues>) => {
    let next = overrides;
    for (const [key, value] of Object.entries(patch) as [
      (typeof LINUX_KEYS)[number],
      LinuxLaunchValues[(typeof LINUX_KEYS)[number]],
    ][]) {
      next = setOverride(next, key, value as never);
    }
    onChange(next);
  };

  const languageCard = languageRow ? (
    <SectionCard
      title={t("instanceSettings.groups.language")}
      icon={Languages}
      className="shrink-0"
    >
      {languageRow}
    </SectionCard>
  ) : null;

  const lockNote = (
    <Collapse show={Boolean(hint)}>
      {hint ? (
        <p className="flex items-start gap-2 border-b border-border/60 px-3 py-2 text-2xs leading-snug text-faint">
          <Lock className="mt-0.5 size-3 shrink-0" />
          {hint}
        </p>
      ) : null}
    </Collapse>
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-[minmax(0,1fr)] gap-3">
      <div className="flex min-h-0 flex-col gap-3">
        {loaderCard}

        <SectionCard
          title={t("instanceSettings.groups.performance")}
          icon={MemoryStick}
          className="shrink-0"
          action={
            <>
              <GroupReset
                overrides={overrides}
                keys={PERFORMANCE_KEYS}
                disabled={disabled}
                onChange={onChange}
              />
              <AskAgentButton
                variant="ghost"
                className="size-6 text-faint"
                prompt={t("agent.prompts.instanceSettings", {
                  memory: resolved.xmx,
                })}
              />
            </>
          }
        >
          {lockNote}
          <div className="divide-y divide-border/60">
            <SettingLine
              icon={MemoryStick}
              title={t("settings.memory")}
              overridden={isOverridden(overrides, "xmx")}
              disabled={disabled}
              onReset={() => reset("xmx")}
            >
              <MemoryControl
                compact
                value={resolved.xmx}
                totalMemoryMb={totalMemoryMb}
                optimizedJvm={resolved.optimizedJvm}
                disabled={disabled}
                onChange={(xmx) => set("xmx", xmx)}
              />
            </SettingLine>

            <SettingLine
              icon={Zap}
              title={t("settings.optimizedJvm")}
              overridden={isOverridden(overrides, "optimizedJvm")}
              disabled={disabled}
              onReset={() => reset("optimizedJvm")}
              hint={
                <JvmFlagsInfo
                  hint={t("instanceSettings.optimizedHint", {
                    flags: OPTIMIZED_GC_FLAGS.length,
                  })}
                >
                  <button
                    type="button"
                    className="max-w-full truncate rounded-sm underline decoration-dotted underline-offset-4 transition-colors hover:text-muted-foreground"
                  >
                    {t("instanceSettings.optimizedHint", {
                      flags: OPTIMIZED_GC_FLAGS.length,
                    })}
                  </button>
                </JvmFlagsInfo>
              }
              control={
                <Switch
                  aria-label={t("settings.optimizedJvm")}
                  disabled={disabled}
                  checked={resolved.optimizedJvm}
                  onCheckedChange={(checked) => set("optimizedJvm", checked)}
                />
              }
            />

            {PLATFORM === "win32" && (
              <SettingLine
                icon={Gauge}
                title={t("settings.highPriority")}
                hint={t("instanceSettings.priorityHint")}
                overridden={isOverridden(overrides, "highPriority")}
                disabled={disabled}
                onReset={() => reset("highPriority")}
                control={
                  <Switch
                    aria-label={t("settings.highPriority")}
                    disabled={disabled}
                    checked={resolved.highPriority}
                    onCheckedChange={(checked) => set("highPriority", checked)}
                  />
                }
              />
            )}

            {supportsGpuPreference(PLATFORM) && (
              <SettingLine
                icon={Cpu}
                title={t("launchSettings.gpu.title")}
                overridden={isOverridden(overrides, "gpuPreference")}
                disabled={disabled}
                onReset={() => reset("gpuPreference")}
                control={
                  <GpuPreferenceControl
                    value={resolved.gpuPreference}
                    disabled={disabled}
                    onChange={(gpuPreference) =>
                      set("gpuPreference", gpuPreference)
                    }
                  />
                }
              />
            )}

            {isLinux && (
              <SettingLine
                icon={SquareTerminal}
                title={t("launchSettings.linux.title")}
                hint={linuxSummary(resolved, t)}
                overridden={linuxOverridden}
                disabled={disabled}
                onReset={() => onChange(clearKeys(overrides, LINUX_KEYS))}
                control={
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7"
                      >
                        {t("launchSettings.linux.configure")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      collisionPadding={{
                        top: TITLEBAR_HEIGHT + 8,
                        right: 8,
                        bottom: 8,
                        left: 8,
                      }}
                      className="max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[26rem] overflow-y-auto p-3"
                    >
                      <LinuxLaunchFields
                        idPrefix="instance-linux"
                        values={resolved}
                        tools={linuxTools}
                        disabled={disabled}
                        onChange={patchLinux}
                        footer={
                          !linuxOverridden ? (
                            <p className="text-xs text-faint">
                              {t("launchSettings.linux.inheritedHint")}
                            </p>
                          ) : undefined
                        }
                      />
                    </PopoverContent>
                  </Popover>
                }
              />
            )}
          </div>
        </SectionCard>

      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <SectionCard
          title={t("instanceSettings.groups.compatibility")}
          icon={Coffee}
          className="shrink-0"
          action={
            <GroupReset
              overrides={overrides}
              keys={COMPATIBILITY_KEYS}
              disabled={disabled}
              onChange={onChange}
            />
          }
        >
          <div className="divide-y divide-border/60">
            <SettingLine
              icon={Coffee}
              title={t("instanceSettings.java.title")}
              overridden={isOverridden(overrides, "java")}
              disabled={disabled}
              onReset={() => reset("java")}
              control={
                <>
                  {javaState && JavaStatusIcon && (
                    <Hint content={javaState.text}>
                      <span
                        data-slot="java-status"
                        role="img"
                        aria-label={javaState.text}
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center",
                          JAVA_STATUS_TONE[javaState.tone],
                        )}
                      >
                        <JavaStatusIcon className="size-3.5" />
                      </span>
                    </Hint>
                  )}
                  <JavaPicker
                    value={overrides?.java}
                    requiredMajor={requiredJavaMajor}
                    disabled={disabled}
                    className="w-48"
                    onChange={(java) =>
                      onChange(
                        java
                          ? setOverride(overrides, "java", java)
                          : clearOverride(overrides, "java"),
                      )
                    }
                  />
                </>
              }
            />

            {showGraphics && (
              <SettingLine
                icon={Monitor}
                title={t("launchSettings.backend.title")}
                hint={
                  shaderLoader
                    ? t("launchSettings.backend.shaders")
                    : backend
                      ? t("launchSettings.backend.forcedHint")
                      : t("launchSettings.backend.gameHint")
                }
                overridden={Boolean(backend) && !shaderLoader}
                control={
                  <GraphicsBackendControl
                    value={backend}
                    disabled={disabled}
                    forcedByShaders={shaderLoader}
                    onChange={(next) =>
                      onChange(
                        next
                          ? setOverride(overrides, "graphicsBackend", next)
                          : clearOverride(overrides, "graphicsBackend"),
                      )
                    }
                  />
                }
              />
            )}
          </div>
        </SectionCard>

        {languageCard}

        {profileCard && (
          <div className="flex min-h-[132px] flex-1 flex-col">
            {profileCard}
          </div>
        )}
      </div>
    </div>
  );
}
