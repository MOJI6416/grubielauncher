import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { SlotToggle } from "./SlotToggle";

export function SlotItem({
  label,
  hidden,
  onToggle,
  disabled,
  disabledReason,
  icon,
  lead,
  trail,
  size = "row",
  className,
  ...rest
}: {
  label: string;
  hidden: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  icon?: ReactNode;
  lead?: ReactNode;
  trail?: ReactNode;
  size?: "row" | "pill";
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "hidden" | "children"> & {
    "data-drop-target"?: string;
  }) {
  return (
    <div
      {...rest}
      className={cn(
        "flex min-w-0 items-center gap-2 transition-colors",
        size === "row"
          ? "h-9 rounded-lg bg-surface-2 pr-1.5 pl-2.5 data-[drop-target]:bg-row-selected"
          : "h-7 rounded-md border border-border pr-0.5 pl-2",
        className,
      )}
    >
      {lead}
      {icon && (
        <span className={cn("shrink-0 text-faint", hidden && "opacity-50")}>{icon}</span>
      )}
      <Hint content={label} variant="text" truncatedOnly>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            size === "row" ? "text-sm" : "text-xs",
            hidden || disabled ? "text-faint" : "text-foreground",
          )}
        >
          {label}
        </span>
      </Hint>
      {trail}
      {onToggle && (
        <SlotToggle
          hidden={hidden}
          label={label}
          disabled={disabled}
          disabledReason={disabledReason}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}
