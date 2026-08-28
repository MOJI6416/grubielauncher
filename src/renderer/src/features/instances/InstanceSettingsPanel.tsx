import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Gauge, Lock, MemoryStick, RotateCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { settingsAtom } from "@renderer/stores/atoms";
import { AskAgentButton } from "@renderer/features/agent/AskAgentButton";
import {
  MEMORY_MIN_MB,
  MEMORY_STEP_MB,
  clampMemory,
  maxMemoryMb,
  toTotalMemoryMb,
} from "@renderer/features/settings/memory";
import { OPTIMIZED_GC_FLAGS } from "@/shared/jvmDefaults";
import {
  InstanceSettingsOverrides,
  OverridableKey,
  clearOverride,
  countOverrides,
  isOverridden,
  resolveInstanceSettings,
  setOverride,
} from "@/shared/instanceSettings";

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
  hint?: string;
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
            overridden ? "text-primary" : "text-faint",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          className={cn(
            "h-6 shrink-0 rounded-md border px-2 text-[0.65rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            overridden
              ? "border-primary/40 bg-primary-soft text-foreground"
              : "border-border text-faint hover:text-muted-foreground",
          )}
        >
          {overridden
            ? t("instanceSettings.overridden")
            : t("instanceSettings.inherited")}
        </button>
      </div>

      <div className="flex items-center gap-3 pl-6">
        {hint && (
          <span className="min-w-0 flex-1 truncate text-[0.7rem] text-faint">
            {hint}
          </span>
        )}
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

export function InstanceSettingsPanel({
  overrides,
  onChange,
  disabled,
  hint,
}: {
  overrides: InstanceSettingsOverrides | undefined;
  onChange: (next: InstanceSettingsOverrides | undefined) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const global = useAtomValue(settingsAtom);
  const resolved = resolveInstanceSettings(global, overrides);
  const [totalMemoryMb, setTotalMemoryMb] = useState(0);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;

    void api.os
      .totalmem()
      .then((total) => {
        if (!cancelled) setTotalMemoryMb(toTotalMemoryMb(total));
      })
      .catch(() => {});

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
        <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {t("instanceSettings.title")}
        </span>
        {overriddenCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            className="h-6 px-2 text-[0.7rem] text-faint"
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
          <p className="flex items-start gap-2 border-b border-border/60 px-3 py-2 text-[0.7rem] leading-snug text-faint">
            <Lock className="mt-0.5 size-3 shrink-0" />
            {hint}
          </p>
        ) : null}
      </Collapse>

      <div className="divide-y divide-border/60">
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
            <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums">
              {resolved.xmx} {t("settings.mb")}
            </span>
          </div>
        </OverrideRow>

        <OverrideRow
          icon={Zap}
          title={t("settings.optimizedJvm")}
          hint={t("instanceSettings.optimizedHint", {
            flags: OPTIMIZED_GC_FLAGS.length,
          })}
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
      </div>
    </section>
  );
}
