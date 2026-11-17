import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Coffee,
  Cpu,
  Gauge,
  Lock,
  MemoryStick,
  Monitor,
  RotateCcw,
  SquareTerminal,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Slider } from "@/components/ui/slider";
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
  MEMORY_MIN_MB,
  MEMORY_STEP_MB,
  clampMemory,
  maxMemoryMb,
  toTotalMemoryMb,
} from "@renderer/features/settings/memory";
import { OPTIMIZED_GC_FLAGS } from "@/shared/jvmDefaults";
import { formatNumber } from "@renderer/utilities/numbers";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { JvmFlagsInfo } from "@renderer/components/JvmFlagsInfo";
import {
  InstanceSettingsOverrides,
  OverridableKey,
  clearOverride,
  countOverrides,
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

const LINUX_KEYS = [
  "gameMode",
  "mangoHud",
  "wrapperCommand",
  "launchEnv",
  "preLaunchCommand",
  "postExitCommand",
] as const satisfies readonly (OverridableKey & keyof LinuxLaunchValues)[];

function linuxSummary(
  values: LinuxLaunchValues,
  t: (key: string) => string,
): string {
  const parts = [
    values.gameMode ? "GameMode" : "",
    values.mangoHud ? "MangoHud" : "",
    values.wrapperCommand.trim() ? t("launchSettings.linux.summaryWrapper") : "",
    values.launchEnv.trim() ? t("launchSettings.linux.summaryEnv") : "",
    values.preLaunchCommand.trim() || values.postExitCommand.trim()
      ? t("launchSettings.linux.summaryHooks")
      : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : t("launchSettings.linux.summaryNone");
}

function GraphicsBackendRow({
  overrides,
  shaderLoader,
  disabled,
  onChange,
}: {
  overrides: InstanceSettingsOverrides | undefined;
  shaderLoader: boolean;
  disabled?: boolean;
  onChange: (next: InstanceSettingsOverrides | undefined) => void;
}) {
  const { t } = useTranslation();
  const value = instanceGraphicsBackend(overrides);
  const hint = shaderLoader
    ? t("launchSettings.backend.shaders")
    : value
      ? t("launchSettings.backend.forcedHint")
      : t("launchSettings.backend.gameHint");

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Monitor
          className={cn(
            "size-4 shrink-0",
            value && !shaderLoader ? "text-info" : "text-faint",
          )}
        />
        <Hint content={t("launchSettings.backend.title")} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-sm">
            {t("launchSettings.backend.title")}
          </span>
        </Hint>
      </div>
      <div className="flex items-center gap-3 pl-6">
        <Hint content={hint} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-2xs text-faint">
            {hint}
          </span>
        </Hint>
        <GraphicsBackendControl
          value={value}
          disabled={disabled}
          forcedByShaders={shaderLoader}
          onChange={(backend) =>
            onChange(
              backend
                ? setOverride(overrides, "graphicsBackend", backend)
                : clearOverride(overrides, "graphicsBackend"),
            )
          }
        />
      </div>
    </div>
  );
}

const api = window.api;

function OverrideRow({
  icon: Icon,
  title,
  hint,
  overridden,
  disabled,
  onToggle,
  children,
}: {
  icon: typeof Gauge;
  title: string;
  hint?: React.ReactNode;
  overridden: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "size-4 shrink-0",
            overridden ? "text-info" : "text-faint",
          )}
        />
        <Hint content={title} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
        </Hint>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          className={cn(
            "h-6 shrink-0 rounded-md border px-2 text-3xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            overridden
              ? "border-info/40 bg-info/15 text-foreground"
              : "border-border text-faint hover:text-muted-foreground",
          )}
        >
          {overridden
            ? t("instanceSettings.overridden")
            : t("instanceSettings.inherited")}
        </button>
      </div>

      <div className="flex items-center gap-3 pl-6">
        {hint &&
          (typeof hint === "string" ? (
            <Hint content={hint} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-2xs text-faint">
                {hint}
              </span>
            </Hint>
          ) : (
            <span className="min-w-0 flex-1 overflow-hidden text-2xs text-faint">
              {hint}
            </span>
          ))}
        <div
          className={cn(
            hint ? "shrink-0" : "min-w-0 flex-1",
            overridden ? "" : "opacity-45",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function JavaOverrideRow({
  overrides,
  requiredMajor,
  disabled,
  onChange,
}: {
  overrides: InstanceSettingsOverrides | undefined;
  requiredMajor: number;
  disabled?: boolean;
  onChange: (next: InstanceSettingsOverrides | undefined) => void;
}) {
  const { t } = useTranslation();
  const { list } = useJavaRuntimes();
  const overridden = isOverridden(overrides, "java");
  const status = javaStatus(overrides?.java, requiredMajor, list, t);
  const StatusIcon = status?.icon;

  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <Coffee
        className={cn(
          "size-4 shrink-0",
          overridden ? "text-info" : "text-faint",
        )}
      />
      <Hint content={t("instanceSettings.java.title")} variant="text" truncatedOnly>
        <span className="min-w-0 flex-1 truncate text-sm">
          {t("instanceSettings.java.title")}
        </span>
      </Hint>
      {status && StatusIcon && (
        <Hint content={status.text}>
          <span
            data-slot="java-status"
            role="img"
            aria-label={status.text}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center",
              JAVA_STATUS_TONE[status.tone],
            )}
          >
            <StatusIcon className="size-3.5" />
          </span>
        </Hint>
      )}
      <JavaPicker
        value={overrides?.java}
        requiredMajor={requiredMajor}
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
    </div>
  );
}

export function InstanceSettingsPanel({
  overrides,
  onChange,
  disabled,
  hint,
  requiredJavaMajor,
  extraRows,
  minecraftVersion,
  shaderLoader = false,
}: {
  overrides: InstanceSettingsOverrides | undefined;
  onChange: (next: InstanceSettingsOverrides | undefined) => void;
  disabled?: boolean;
  hint?: string;
  requiredJavaMajor: number;
  extraRows?: React.ReactNode;
  minecraftVersion?: string;
  shaderLoader?: boolean;
}) {
  const global = useAtomValue(settingsAtom);
  const resolved = resolveInstanceSettings(global, overrides);
  const [totalMemoryMb, setTotalMemoryMb] = useState(0);
  const { t } = useTranslation();
  const isLinux = PLATFORM === "linux";
  const linuxTools = useLinuxLaunchTools(isLinux);
  const linuxOverridden = LINUX_KEYS.some((key) => isOverridden(overrides, key));

  const toggleLinux = () => {
    let next = overrides;
    for (const key of LINUX_KEYS) {
      next = linuxOverridden
        ? clearOverride(next, key)
        : setOverride(next, key, resolved[key] as never);
    }
    onChange(next);
  };

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

  useEffect(() => {
    let cancelled = false;

    void api.os
      .totalmem()
      .then((total) => {
        if (!cancelled) setTotalMemoryMb(toTotalMemoryMb(total));
      })
      .catch(ignoreFailure);

    return () => {
      cancelled = true;
    };
  }, []);

  const memoryMax = Math.max(maxMemoryMb(totalMemoryMb), resolved.xmx);

  const toggle = (key: OverridableKey, value: boolean | number) => {
    onChange(
      isOverridden(overrides, key)
        ? clearOverride(overrides, key)
        : setOverride(overrides, key, value as never),
    );
  };

  const overriddenCount = countOverrides(overrides);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        <MemoryStick className="size-3.5 shrink-0 text-faint" />
        <Hint content={t("instanceSettings.title")} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-2xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {t("instanceSettings.title")}
          </span>
        </Hint>
        {overriddenCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            className="h-6 px-2 text-2xs text-faint"
            onClick={() => onChange(undefined)}
          >
            <RotateCcw />
            {t("instanceSettings.resetAll")}
          </Button>
        )}

        <AskAgentButton
          variant="ghost"
          className="size-6 text-faint"
          prompt={t("agent.prompts.instanceSettings", {
            memory: resolved.xmx,
          })}
        />
      </header>

      <Collapse show={Boolean(hint)}>
        {hint ? (
          <p className="flex items-start gap-2 border-b border-border/60 px-3 py-2 text-2xs leading-snug text-faint">
            <Lock className="mt-0.5 size-3 shrink-0" />
            {hint}
          </p>
        ) : null}
      </Collapse>

      <div className="min-h-0 divide-y divide-border/60 overflow-y-auto">
        <OverrideRow
          icon={MemoryStick}
          title={t("settings.memory")}
          overridden={isOverridden(overrides, "xmx")}
          disabled={disabled}
          onToggle={() => toggle("xmx", resolved.xmx)}
        >
          <div className="flex items-center gap-3">
            <Slider
              className="min-w-0 flex-1"
              min={MEMORY_MIN_MB}
              max={memoryMax}
              step={MEMORY_STEP_MB}
              disabled={disabled || !isOverridden(overrides, "xmx")}
              value={[resolved.xmx]}
              onValueChange={([value]) =>
                onChange(
                  setOverride(
                    overrides,
                    "xmx",
                    clampMemory(value, totalMemoryMb),
                  ),
                )
              }
            />
            <span className="min-w-24 shrink-0 text-right font-mono text-xs whitespace-nowrap tabular-nums">
              {formatNumber(resolved.xmx)} {t("settings.mb")}
            </span>
          </div>
        </OverrideRow>

        <OverrideRow
          icon={Zap}
          title={t("settings.optimizedJvm")}
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
          overridden={isOverridden(overrides, "optimizedJvm")}
          disabled={disabled}
          onToggle={() => toggle("optimizedJvm", resolved.optimizedJvm)}
        >
          <Switch
            disabled={disabled || !isOverridden(overrides, "optimizedJvm")}
            checked={resolved.optimizedJvm}
            onCheckedChange={(checked) =>
              onChange(setOverride(overrides, "optimizedJvm", checked))
            }
          />
        </OverrideRow>

        {PLATFORM === "win32" && (
          <OverrideRow
            icon={Gauge}
            title={t("settings.highPriority")}
            hint={t("instanceSettings.priorityHint")}
            overridden={isOverridden(overrides, "highPriority")}
            disabled={disabled}
            onToggle={() => toggle("highPriority", resolved.highPriority)}
          >
            <Switch
              disabled={disabled || !isOverridden(overrides, "highPriority")}
              checked={resolved.highPriority}
              onCheckedChange={(checked) =>
                onChange(setOverride(overrides, "highPriority", checked))
              }
            />
          </OverrideRow>
        )}

        {supportsGraphicsBackend(minecraftVersion) && (
          <GraphicsBackendRow
            overrides={overrides}
            shaderLoader={shaderLoader}
            disabled={disabled}
            onChange={onChange}
          />
        )}

        {supportsGpuPreference(PLATFORM) && (
          <OverrideRow
            icon={Cpu}
            title={t("launchSettings.gpu.title")}
            overridden={isOverridden(overrides, "gpuPreference")}
            disabled={disabled}
            onToggle={() =>
              onChange(
                isOverridden(overrides, "gpuPreference")
                  ? clearOverride(overrides, "gpuPreference")
                  : setOverride(
                      overrides,
                      "gpuPreference",
                      resolved.gpuPreference,
                    ),
              )
            }
          >
            <GpuPreferenceControl
              value={resolved.gpuPreference}
              disabled={disabled || !isOverridden(overrides, "gpuPreference")}
              onChange={(gpuPreference) =>
                onChange(setOverride(overrides, "gpuPreference", gpuPreference))
              }
            />
          </OverrideRow>
        )}

        {isLinux && (
          <OverrideRow
            icon={SquareTerminal}
            title={t("launchSettings.linux.title")}
            hint={linuxSummary(resolved, t)}
            overridden={linuxOverridden}
            disabled={disabled}
            onToggle={toggleLinux}
          >
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="h-7">
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
                  disabled={disabled || !linuxOverridden}
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
          </OverrideRow>
        )}

        <JavaOverrideRow
          overrides={overrides}
          requiredMajor={requiredJavaMajor}
          disabled={disabled}
          onChange={onChange}
        />
        {extraRows}
      </div>
    </section>
  );
}
