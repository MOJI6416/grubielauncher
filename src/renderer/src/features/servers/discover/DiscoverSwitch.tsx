import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@renderer/components/SegmentedControl";

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
  const { t } = useTranslation();

  return (
    <SegmentedControl
      value={value}
      iconOnly={compact}
      disabled={disabled}
      ariaLabel={t("servers.discover.sourceLabel")}
      options={items.map((item) => ({
        value: item.id,
        label: item.label,
        icon: item.icon,
        count: item.count,
      }))}
      onChange={onChange}
    />
  );
}
