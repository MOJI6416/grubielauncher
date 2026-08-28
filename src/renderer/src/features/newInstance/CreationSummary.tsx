import { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { FactRow, FactRows } from "@renderer/components/FactRows";

export interface SummaryRowData {
  key: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  title?: string;
}

export function SummaryCard({
  title,
  rows,
  warnings = [],
  children,
  className,
}: {
  title: string;
  rows: SummaryRowData[];
  warnings?: string[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1",
        className,
      )}
    >
      <header className="flex h-8 shrink-0 items-center border-b border-border px-2.5">
        <span className="truncate text-[0.7rem] font-semibold tracking-[0.08em] text-faint uppercase">
          {title}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <FactRows surface="card">
          {rows.map((row) => (
            <FactRow
              key={row.key}
              icon={row.icon}
              label={row.label}
              value={row.value}
              hint={row.title}
            />
          ))}
        </FactRows>

        {children}

        {warnings.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border/60 p-2.5">
            {warnings.map((warning) => (
              <p
                key={warning}
                className="flex items-start gap-1.5 text-[0.7rem] leading-snug text-muted-foreground"
              >
                <TriangleAlert className="mt-px size-3 shrink-0 text-warning" />
                <span className="min-w-0">{warning}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
