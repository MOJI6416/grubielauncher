import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Package, Pin, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { ListSkeleton } from "@renderer/components/ListSkeleton";

const ROW_HEIGHT = 34;

export interface BisectFileItem {
  file: string;
  label: string;
  iconUrl?: string | null;
  off?: boolean;
  note?: string;
  pinned?: boolean;
}

export function BisectFileList({
  header,
  items,
  isLoading,
  emptyText,
  checkLabel,
  isChecked,
  onToggle,
}: {
  header: ReactNode;
  items: BisectFileItem[];
  isLoading?: boolean;
  emptyText: string;
  checkLabel?: string;
  isChecked?: (file: string) => boolean;
  onToggle?: (file: string, checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.file.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-2.5">
        {header}
      </header>

      {items.length > 8 && (
        <div className="relative shrink-0 border-b border-border px-1.5 py-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                setQuery("");
              }
            }}
            placeholder={t("bisect.search")}
            aria-label={t("bisect.search")}
            className="h-7 border-transparent bg-surface-2 pl-7 text-xs"
          />
        </div>
      )}

      <div ref={setScrollElement} className="min-h-0 flex-1 overflow-y-auto p-1">
        {isLoading ? (
          <ListSkeleton
            rows={8}
            rowClassName="h-[34px]"
            iconClassName="size-6 rounded-md"
          />
        ) : visible.length === 0 ? (
          <Empty className="h-full px-4">
            <EmptyDescription className="text-xs">
              {items.length === 0 ? emptyText : t("bisect.notFound")}
            </EmptyDescription>
          </Empty>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const item = visible[row.index];
              if (!item) return null;
              const checked = isChecked?.(item.file) ?? false;
              const toggle = onToggle
                ? (value: boolean) => onToggle(item.file, value)
                : null;

              return (
                <div
                  key={item.file}
                  style={{
                    height: `${row.size}px`,
                    transform: `translateY(${row.start}px)`,
                  }}
                  className={cn(
                    "absolute top-0 left-0 flex w-full items-center gap-2 rounded-lg px-2",
                    toggle && "cursor-pointer hover:bg-row-hover",
                  )}
                  onClick={toggle ? () => toggle(!checked) : undefined}
                >
                  {toggle && (
                    <Checkbox
                      checked={checked}
                      aria-label={`${checkLabel ?? ""} ${item.label}`.trim()}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={(value) => toggle(value === true)}
                    />
                  )}

                  <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
                    {item.iconUrl ? (
                      <img
                        src={item.iconUrl}
                        alt=""
                        draggable={false}
                        loading="lazy"
                        className={cn(
                          "size-full object-cover",
                          item.off && "opacity-50 grayscale",
                        )}
                      />
                    ) : (
                      <Package className="size-3 text-faint" />
                    )}
                  </span>

                  <Hint content={item.label} variant="text" truncatedOnly>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-xs",
                        item.off ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                  </Hint>

                  {item.note && (
                    <span className="shrink-0 text-3xs whitespace-nowrap text-faint">
                      {item.note}
                    </span>
                  )}
                  {item.pinned && (
                    <Pin className="size-3 shrink-0 text-faint" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
