import type { ReactNode } from "react";
import { SlidingIndicator } from "@renderer/components/SlidingIndicator";
import { ScopeButton } from "@renderer/features/mods/contentManagerParts";
import { useSlidingIndicator } from "@renderer/utilities/useSlidingIndicator";

export interface DiscoverSwitchItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
  count?: number;
}

export function DiscoverSwitch<T extends string>({
  value,
  items,
  disabled,
  compact = false,
  onChange,
}: {
  value: T;
  items: DiscoverSwitchItem<T>[];
  disabled?: boolean;
  compact?: boolean;
  onChange: (value: T) => void;
}) {
  const indicator = useSlidingIndicator<HTMLDivElement>();

  return (
    <div
      ref={indicator.containerRef}
      className="relative flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5"
    >
      <SlidingIndicator
        indicator={indicator}
        variant="fill"
        className="rounded-md bg-surface-3"
      />
      {items.map((item) => (
        <ScopeButton
          key={item.id}
          active={value === item.id}
          label={item.label}
          count={item.count}
          compact={compact}
          disabled={disabled}
          onClick={() => onChange(item.id)}
        >
          {item.icon}
        </ScopeButton>
      ))}
    </div>
  );
}
