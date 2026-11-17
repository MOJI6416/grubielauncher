import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { ListSkeleton } from "@renderer/components/ListSkeleton";

export interface FilterOption {
  key: string;
  label: string;
  keywords?: string;
  count?: number;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

export interface FilterSection {
  key: string;
  title?: ReactNode;
  divided?: boolean;
  options: FilterOption[];
}

export function filterSections(
  sections: FilterSection[],
  query: string,
): FilterSection[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sections;

  return sections
    .map((section) => ({
      ...section,
      options: section.options.filter(
        (option) =>
          option.label.toLowerCase().includes(needle) ||
          Boolean(option.keywords?.toLowerCase().includes(needle)),
      ),
    }))
    .filter((section) => section.options.length > 0);
}

export function FilterOptionList({
  sections,
  query,
  onQueryChange,
  placeholder,
  emptyText,
  isLoading = false,
}: {
  sections: FilterSection[];
  query: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  emptyText: string;
  isLoading?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const visible = useMemo(
    () => filterSections(sections, query),
    [query, sections],
  );
  const selectable = useMemo(
    () =>
      visible.flatMap((section) =>
        section.options.filter((option) => !option.disabled),
      ),
    [visible],
  );
  const active =
    selectable.find((option) => option.key === highlighted) ??
    (query.trim() ? selectable[0] : undefined);
  const activeKey = active?.key;

  useEffect(() => {
    if (!activeKey) return;
    listRef.current
      ?.querySelector(`[data-option-key="${CSS.escape(activeKey)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  const move = (delta: number) => {
    if (selectable.length === 0) return;
    const index = active ? selectable.indexOf(active) : -1;
    const next =
      index === -1
        ? delta > 0
          ? 0
          : selectable.length - 1
        : (index + delta + selectable.length) % selectable.length;
    setHighlighted(selectable[next].key);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter" && active) {
      event.preventDefault();
      active.onToggle();
      setHighlighted(active.key);
      if (query) onQueryChange("");
    }
  };

  return (
    <>
      <div className="border-b border-border p-1.5">
        <Input
          value={query}
          className="h-8"
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setHighlighted(null);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div
        ref={listRef}
        className="max-h-[min(30rem,calc(100vh-14rem))] overflow-y-auto p-1.5"
      >
        {isLoading ? (
          <ListSkeleton
            rows={5}
            rowClassName="h-8"
            iconClassName="size-4 rounded"
          />
        ) : visible.length === 0 ? (
          <Empty className="gap-2 px-2 py-6">
            <EmptyDescription className="text-xs">{emptyText}</EmptyDescription>
          </Empty>
        ) : (
          visible.map((section) => (
            <div
              key={section.key}
              className={cn(
                section.divided && "mt-1 border-t border-border pt-1",
                section.title && !section.divided && "mb-1",
              )}
            >
              {section.title && (
                <p className="flex items-center gap-1.5 px-2 py-1 text-2xs font-medium text-faint uppercase">
                  {section.title}
                </p>
              )}
              {section.options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  data-option-key={option.key}
                  data-highlighted={option.key === activeKey || undefined}
                  disabled={option.disabled}
                  onClick={() => {
                    option.onToggle();
                    setHighlighted(option.key);
                  }}
                  onPointerMove={() => setHighlighted(option.key)}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors disabled:opacity-40 data-[highlighted]:bg-row-hover"
                >
                  <Checkbox
                    checked={option.checked}
                    className="pointer-events-none"
                  />
                  <Hint content={option.label} variant="text" truncatedOnly>
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                  </Hint>
                  {option.count !== undefined && (
                    <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                      {option.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
