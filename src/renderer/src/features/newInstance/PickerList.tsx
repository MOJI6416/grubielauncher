import { ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";

export interface PickerItem {
  id: string;
  label: string;
  meta?: string;
  badge?: string;
  tone?: "warning" | "muted";
}

const ROW_HEIGHT = 30;

export function PickerList({
  label,
  items,
  value,
  onSelect,
  query,
  onQueryChange,
  isLoading = false,
  isDisabled = false,
  emptyText,
  emptyAction,
  filters,
  total,
}: {
  label: string;
  items: PickerItem[];
  value?: string;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  emptyText: string;
  emptyAction?: ReactNode;
  filters?: ReactNode;
  total?: number;
}) {
  const { t } = useTranslation();
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const selectedRef = useRef<string | undefined>(undefined);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  useEffect(() => {
    if (!scrollElement || !value || selectedRef.current === value) return;

    const index = items.findIndex((item) => item.id === value);
    if (index < 0) return;

    selectedRef.current = value;
    virtualizer.scrollToIndex(index, { align: "center" });
  }, [items, value, virtualizer, scrollElement]);

  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1",
        isDisabled && "opacity-60",
      )}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-2.5">
        <span className="shrink-0 text-[0.7rem] font-semibold tracking-[0.08em] text-faint uppercase">
          {label}
        </span>
        {typeof total === "number" && total > 0 && (
          <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-faint">
            {total}
          </span>
        )}
        {isLoading && (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-faint" />
        )}
        <div className="relative ml-auto min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-faint" />
          <input
            value={query}
            disabled={isDisabled}
            aria-label={`${label}: ${t("common.search")}`}
            placeholder={t("common.search")}
            onChange={(event) => onQueryChange(event.target.value)}
            className="h-6 w-full min-w-0 rounded-md bg-surface-2 pr-2 pl-6 font-mono text-[0.7rem] text-foreground placeholder:font-sans placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed"
          />
        </div>
      </header>

      {filters && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1.5">
          {filters}
        </div>
      )}

      <div
        ref={setScrollElement}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1"
      >
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-xs text-muted-foreground">
              {isLoading ? t("common.searching") : emptyText}
            </p>
            {!isLoading && emptyAction}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const item = items[row.index];
              if (!item) return null;

              const isSelected = item.id === value;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isDisabled}
                  onClick={() => onSelect(item.id)}
                  style={{
                    height: `${row.size}px`,
                    transform: `translateY(${row.start}px)`,
                  }}
                  className="absolute top-0 left-0 flex w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-surface-3 aria-selected:bg-primary-soft disabled:cursor-not-allowed"
                >
                  <Hint content={item.label} variant="text" truncatedOnly>
                    <span
                      className={cn(
                        "min-w-0 truncate font-mono text-xs",
                        isSelected
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                  </Hint>

                  {item.badge && (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1 py-px text-[0.6rem] leading-4",
                        item.tone === "warning"
                          ? "bg-warning/15 text-warning"
                          : "bg-surface-3 text-faint",
                      )}
                    >
                      {item.badge}
                    </span>
                  )}

                  {item.meta && (
                    <span className="ml-auto shrink-0 text-[0.65rem] tabular-nums text-faint">
                      {item.meta}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
