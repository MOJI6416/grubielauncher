import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Fact({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2">
      <Icon className="size-4 shrink-0 text-faint" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[0.62rem] leading-tight text-faint">
          {label}
        </span>
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="truncate text-sm font-semibold tabular-nums">
            {value}
          </span>
          {note && (
            <span className="truncate text-[0.62rem] tabular-nums">{note}</span>
          )}
        </span>
      </div>
    </div>
  );
}

export function Panel({
  title,
  icon: Icon,
  hint,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  icon: LucideIcon;
  hint?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        <Icon className="size-3.5 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </span>
        {hint && (
          <span className="shrink-0 font-mono text-[0.65rem] text-faint">
            {hint}
          </span>
        )}
      </header>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
