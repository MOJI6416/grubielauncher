import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { memoryShortfall } from "@/shared/memoryCheck";
import { onRadioKeyDown, radioFocusIndex } from "@renderer/utilities/radioKeys";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { OS_NAME } from "@renderer/utilities/platform";
import {
  MEMORY_MIN_MB,
  MEMORY_STEP_MB,
  activePresetId,
  clampMemory,
  formatGigabytes,
  formatGigabytesFixed,
  maxMemoryMb,
  memoryAdvice,
  memoryArgsPreview,
  memoryPresets,
  memoryTicks,
  tickOffset,
  toTotalMemoryMb,
} from "./memory";

const api = window.api;

const ADVICE_STYLE = {
  info: { icon: Info, tone: "text-faint" },
  warning: { icon: TriangleAlert, tone: "text-warning" },
  danger: { icon: CircleAlert, tone: "text-destructive" },
} as const;

let knownAvailableBytes: number | null = null;
let knownTotalMb = 0;
let totalRequest: Promise<number> | null = null;

function loadTotalMemoryMb(): Promise<number> {
  totalRequest ??= api.os
    .totalmem()
    .catch(ignoreFailure)
    .then((bytes) => {
      knownTotalMb = bytes ? toTotalMemoryMb(bytes) : 0;
      if (!knownTotalMb) totalRequest = null;
      return knownTotalMb;
    });
  return totalRequest;
}

void loadTotalMemoryMb();

function useAvailableMemory(): number | null {
  const [available, setAvailable] = useState(knownAvailableBytes);

  useEffect(() => {
    let cancelled = false;
    const read = () =>
      void api.os
        .availableMemory()
        .catch(ignoreFailure)
        .then((bytes) => {
          knownAvailableBytes = bytes ?? null;
          if (!cancelled) setAvailable(knownAvailableBytes);
        });

    read();
    window.addEventListener("focus", read);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", read);
    };
  }, []);

  return available;
}

function Amount({ mb, widestMb }: { mb: number; widestMb: number }) {
  return (
    <span
      className="inline-block text-right"
      style={{ minWidth: `${formatGigabytesFixed(widestMb).length}ch` }}
    >
      {formatGigabytesFixed(mb)}
    </span>
  );
}

export function MemoryControl({
  value,
  totalMemoryMb,
  optimizedJvm,
  onChange,
  disabled,
  compact = false,
}: {
  value: number;
  totalMemoryMb: number;
  optimizedJvm: boolean;
  onChange: (mb: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const availableBytes = useAvailableMemory();

  useEffect(() => setDraft(value), [value]);

  const max = Math.max(maxMemoryMb(totalMemoryMb), value);
  const presets = memoryPresets(totalMemoryMb);
  const ticks = memoryTicks(totalMemoryMb);
  const active = activePresetId(draft, totalMemoryMb);
  const presetIds = presets.map((preset) => preset.id);
  const presetFocus = radioFocusIndex(presetIds, active);
  const advice = memoryAdvice(draft, totalMemoryMb, optimizedJvm);
  const shortfall = memoryShortfall({ allocatedMb: draft, availableBytes });
  const gameShare = totalMemoryMb
    ? Math.min(100, Math.round((draft / totalMemoryMb) * 100))
    : 0;
  const systemMb = Math.max(0, totalMemoryMb - draft);
  const widestSystemMb = Math.max(0, totalMemoryMb - MEMORY_MIN_MB);

  const apply = (mb: number) => {
    const next = clampMemory(mb, totalMemoryMb);
    setDraft(next);
    if (next !== value) onChange(next);
  };

  const selectPreset = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (preset) apply(preset.mb);
  };

  const Advice = advice ? ADVICE_STYLE[advice.tone].icon : Info;

  const valueLabel = (
    <span className="shrink-0 font-mono text-lg whitespace-nowrap tabular-nums text-foreground">
      <Amount mb={draft} widestMb={max} />
      <span className="ml-1 text-xs text-faint">{t("settings.game.gb")}</span>
    </span>
  );

  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
      <div className="flex items-center gap-2">
        <div
          role="radiogroup"
          aria-label={t("settings.memory")}
          onKeyDown={(event) =>
            onRadioKeyDown(event, presetIds, active, selectPreset)
          }
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5",
            !compact && "flex-wrap",
          )}
        >
          {presets.map((preset, index) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active === preset.id}
              tabIndex={index === presetFocus ? 0 : -1}
              disabled={disabled}
              onClick={() => apply(preset.mb)}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
                active === preset.id
                  ? "border-primary/50 bg-primary-soft text-foreground"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`settings.game.presets.${preset.id}`)}
              <span className="font-mono tabular-nums text-faint">
                {formatGigabytes(preset.mb)}
              </span>
            </button>
          ))}
        </div>
        {!compact && valueLabel}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Slider
            min={MEMORY_MIN_MB}
            max={max}
            step={MEMORY_STEP_MB}
            disabled={disabled}
            value={[Math.min(draft, max)]}
            onValueChange={([next]) => {
              if (typeof next === "number") setDraft(next);
            }}
            onValueCommit={([next]) => {
              if (typeof next === "number") apply(next);
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
        </div>
        {compact && valueLabel}
      </div>

      {totalMemoryMb > 0 &&
        (compact ? (
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-[2px] bg-info" />
              {t("settings.game.splitGame")}
              <span className="font-mono whitespace-nowrap tabular-nums text-faint">
                <Amount mb={draft} widestMb={max} /> {t("settings.game.gb")}
              </span>
            </span>
            <span className="flex h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-surface-3">
              <span
                className="h-full bg-info"
                style={{ width: `${gameShare}%` }}
              />
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {t("settings.game.splitSystem")}
              <span className="font-mono whitespace-nowrap tabular-nums text-faint">
                <Amount mb={systemMb} widestMb={widestSystemMb} />{" "}
                {t("settings.game.gb")}
              </span>
            </span>
          </div>
        ) : (
          <div className="rounded-lg bg-surface-2 px-2.5 py-2">
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <span
                className="h-full bg-info"
                style={{ width: `${gameShare}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-2xs">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-[2px] bg-info" />
                {t("settings.game.splitGame")}
                <span className="font-mono whitespace-nowrap tabular-nums text-faint">
                  <Amount mb={draft} widestMb={max} /> {t("settings.game.gb")}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-[2px] bg-surface-3" />
                {t("settings.game.splitSystem")}
                <span className="font-mono whitespace-nowrap tabular-nums text-faint">
                  <Amount mb={systemMb} widestMb={widestSystemMb} />{" "}
                  {t("settings.game.gb")}
                </span>
              </span>
            </div>
          </div>
        ))}

      {shortfall ? (
        <p className="flex items-start gap-1.5 text-xs leading-snug text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span>
            {t("settings.game.freeNow", {
              free: formatGigabytesFixed(shortfall.availableMb),
              allocated: formatGigabytesFixed(shortfall.allocatedMb),
            })}
          </span>
        </p>
      ) : (
        advice && (
          <p
            className={cn(
              "flex items-start gap-1.5 text-xs leading-snug",
              ADVICE_STYLE[advice.tone].tone,
            )}
          >
            <Advice className="mt-px size-3.5 shrink-0" />
            <span>
              {t(`settings.game.advice.${advice.key}`, {
                free: formatGigabytesFixed(advice.headroomMb),
                os: OS_NAME,
              })}
            </span>
          </p>
        )
      )}

      {!compact && (
        <p className="font-mono text-3xs text-faint">
          {memoryArgsPreview(draft, optimizedJvm)}
        </p>
      )}
    </div>
  );
}

export function useTotalMemoryMb(): number {
  const [total, setTotal] = useState(knownTotalMb);

  useEffect(() => {
    if (total) return;
    let cancelled = false;
    void loadTotalMemoryMb().then((mb) => {
      if (!cancelled && mb) setTotal(mb);
    });
    return () => {
      cancelled = true;
    };
  }, [total]);

  return total;
}
