import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { SlidingIndicator } from "@renderer/components/SlidingIndicator";
import { useSlidingIndicator } from "@renderer/utilities/useSlidingIndicator";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
  hint?: ReactNode;
}

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

export function segmentKeyTarget(
  key: string,
  current: number,
  enabled: boolean[],
): number | null {
  const count = enabled.length;
  const all = Array.from({ length: count }, (_, index) => index);
  const after = all.map((step) => (current + step + 1) % count);
  const before = all.map((step) => (current - step - 1 + count) % count);

  const order =
    key === "Home" || (current < 0 && NEXT_KEYS.has(key))
      ? all
      : key === "End" || (current < 0 && PREVIOUS_KEYS.has(key))
        ? [...all].reverse()
        : NEXT_KEYS.has(key)
          ? after
          : PREVIOUS_KEYS.has(key)
            ? before
            : null;

  const target = order?.find((index) => index !== current && enabled[index]);
  return target ?? null;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  iconOnly = false,
  stretch = false,
  disabled = false,
  className,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  iconOnly?: boolean | "inactive";
  stretch?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const indicator = useSlidingIndicator<HTMLDivElement>();
  const enabled = options.map((option) => !disabled && !option.disabled);
  const activeIndex = options.findIndex((option) => option.value === value);
  const focusIndex =
    activeIndex >= 0 && enabled[activeIndex]
      ? activeIndex
      : enabled.indexOf(true);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = segmentKeyTarget(
      event.key,
      activeIndex >= 0 ? activeIndex : focusIndex,
      enabled,
    );
    if (target === null) return;

    event.preventDefault();
    onChange(options[target].value);
    indicator.containerRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      ?.item(target)
      ?.focus();
  };

  return (
    <div
      ref={indicator.containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "relative flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5",
        stretch && "w-full min-w-0",
        className,
      )}
    >
      <SlidingIndicator
        indicator={indicator}
        variant="fill"
        className="rounded-md bg-surface-3"
      />
      {options.map((option, index) => {
        const active = option.value === value;
        const showLabel = !iconOnly || (iconOnly === "inactive" && active);
        const button = (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={showLabel ? undefined : option.label}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={!enabled[index]}
            data-indicator-active={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 aria-checked:text-foreground [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
              showLabel ? "px-2.5" : "w-7",
              stretch && "flex-1",
            )}
          >
            {option.icon}
            {showLabel && <span className="truncate">{option.label}</span>}
            {showLabel && option.count !== undefined && (
              <span className="font-mono text-2xs text-faint tabular-nums">
                {option.count}
              </span>
            )}
          </button>
        );

        return (
          <Hint
            key={option.value}
            content={option.hint ?? option.label}
            variant={option.hint || !showLabel ? "control" : "text"}
            truncatedOnly={!option.hint && showLabel}
          >
            {button}
          </Hint>
        );
      })}
    </div>
  );
}
