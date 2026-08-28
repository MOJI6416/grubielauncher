import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Hint } from "./Hint";

const FACT_SURFACE = {
  card: "bg-surface-1",
  dialog: "bg-card",
  window: "bg-card",
} as const;

export type FactSurface = keyof typeof FACT_SURFACE;

export function FactRows({
  surface = "card",
  framed = false,
  className,
  children,
}: {
  surface?: FactSurface;
  framed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border/60",
        FACT_SURFACE[surface],
        framed && "overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FactRow({
  icon,
  label,
  value,
  hint,
  onSelect,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  onSelect?: () => void;
}) {
  const rendered =
    typeof value === "string" || typeof value === "number" ? (
      <span className="min-w-0 truncate">{value}</span>
    ) : (
      value
    );

  const body = (
    <>
      {icon && (
        <span className="flex size-3.5 shrink-0 items-center justify-center text-faint">
          {icon}
        </span>
      )}
      <Hint content={label} variant="text" truncatedOnly>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {label}
        </span>
      </Hint>
      <Hint
        content={
          hint ??
          (typeof value === "string" || typeof value === "number"
            ? String(value)
            : undefined)
        }
        variant="text"
        truncatedOnly
      >
        <span className="ml-auto flex min-w-0 items-center justify-end gap-2 text-right text-xs font-medium">
          {rendered}
        </span>
      </Hint>
    </>
  );

  if (!onSelect) {
    return <div className="flex items-center gap-2 px-2.5 py-1.5">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
    >
      {body}
    </button>
  );
}
