import type { KeyboardEvent } from "react";
import { segmentKeyTarget } from "@renderer/components/SegmentedControl";

export function radioFocusIndex<T>(
  values: T[],
  current: T | null | undefined,
  enabled: boolean[] = values.map(() => true),
): number {
  const index = current == null ? -1 : values.indexOf(current);
  return index >= 0 && enabled[index] ? index : enabled.indexOf(true);
}

export function onRadioKeyDown<T>(
  event: KeyboardEvent<HTMLElement>,
  values: T[],
  current: T | null | undefined,
  onSelect: (value: T) => void,
  enabled: boolean[] = values.map(() => true),
): void {
  if ((event.target as HTMLElement).getAttribute("role") !== "radio") return;

  const index = current == null ? -1 : values.indexOf(current);
  const target = segmentKeyTarget(event.key, index, enabled);
  if (target === null) return;

  event.preventDefault();
  onSelect(values[target]);
  event.currentTarget
    .querySelectorAll<HTMLElement>('[role="radio"]')
    .item(target)
    ?.focus();
}
