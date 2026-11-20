import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Package, Search, ShieldQuestion } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import type { ProjectType, Provider } from "@/types/ModManager";
import { Hint } from "@renderer/components/Hint";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { PACK_CONTENT_ORDER } from "./packSummary";

const ROW_HEIGHT = 34;

export interface PackContentItem {
  key: string;
  title: string;
  iconUrl?: string | null;
  provider: Provider;
  projectType: ProjectType;
  optional?: boolean;
  enabled?: boolean;
  unknown?: "unknown" | "unchecked";
  install?: boolean;
}

type View = "all" | "optional" | "unknown";

export function filterPackContent(
  items: PackContentItem[],
  query: string,
  view: View,
): PackContentItem[] {
  const needle = query.trim().toLowerCase();

  return items.filter(
    (item) =>
      (view === "all" ||
        (view === "optional" && item.optional) ||
        (view === "unknown" && item.unknown)) &&
      (!needle || item.title.toLowerCase().includes(needle)),
  );
}

export function PackContentList({
  title,
  items,
  isLoading,
  emptyText,
  footer,
  onToggle,
  onToggleInstall,
  className,
}: {
  title: string;
  items: PackContentItem[];
  isLoading?: boolean;
  emptyText: string;
  footer?: ReactNode;
  onToggle?: (key: string, enabled: boolean) => void;
  onToggleInstall?: (key: string, install: boolean) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const optionalCount = items.filter((item) => item.optional).length;
  const unknownCount = items.filter((item) => item.unknown).length;
  const [view, setView] = useState<View>(
    unknownCount > 0 ? "unknown" : optionalCount > 0 ? "optional" : "all",
  );
  const [shownUnknown, setShownUnknown] = useState(unknownCount > 0);

  useEffect(() => {
    if (unknownCount === 0 || shownUnknown) return;
    setShownUnknown(true);
    setView("unknown");
  }, [shownUnknown, unknownCount]);
  const [query, setQuery] = useState("");
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  const activeView: View =
    (view === "optional" && optionalCount > 0) ||
    (view === "unknown" && unknownCount > 0)
      ? view
      : "all";
  const visible = useMemo(
    () => filterPackContent(items, query, activeView),
    [activeView, items, query],
  );

  const groups = useMemo(() => {
    const counts = new Map<ProjectType, number>();
    for (const item of items) {
      counts.set(item.projectType, (counts.get(item.projectType) ?? 0) + 1);
    }
    return [...counts]
      .sort(
        ([a], [b]) => PACK_CONTENT_ORDER.indexOf(a) - PACK_CONTENT_ORDER.indexOf(b),
      )
      .map(([type, count]) => ({ type, count }));
  }, [items]);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-1",
        className,
      )}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-2.5">
        {optionalCount > 0 || unknownCount > 0 ? (
          <SegmentedControl<View>
            value={activeView}
            ariaLabel={title}
            onChange={setView}
            options={[
              { value: "all", label: title, count: items.length },
              ...(unknownCount > 0
                ? [
                    {
                      value: "unknown" as const,
                      label: t("packContent.unknown"),
                      count: unknownCount,
                      hint: t("packContent.unknownHint"),
                    },
                  ]
                : []),
              ...(optionalCount > 0
                ? [
                    {
                      value: "optional" as const,
                      label: t("packContent.optional"),
                      count: optionalCount,
                      hint: t("packContent.optionalHint"),
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <>
            <span className="shrink-0 text-2xs font-semibold tracking-[0.08em] text-faint uppercase">
              {title}
            </span>
            <span className="shrink-0 font-mono text-2xs tabular-nums text-faint">
              {items.length}
            </span>
          </>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-1 overflow-hidden">
          {groups.map((group) => (
            <span
              key={group.type}
              className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-3xs text-muted-foreground"
            >
              {t(`modManager.projectTypes.${group.type}`)}
              <span className="ml-1 font-mono tabular-nums text-faint">
                {group.count}
              </span>
            </span>
          ))}
        </div>
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
            placeholder={t("packContent.filter")}
            aria-label={t("packContent.filter")}
            className="h-7 border-transparent bg-surface-2 pl-7 text-xs"
          />
        </div>
      )}

      <div ref={setScrollElement} className="min-h-0 flex-1 overflow-y-auto p-1">
        {isLoading ? (
          <ListSkeleton rows={8} rowClassName="h-[34px]" iconClassName="size-6 rounded-md" />
        ) : visible.length === 0 ? (
          <Empty className="h-full px-4">
            <EmptyDescription className="text-xs">
              {items.length === 0 ? emptyText : t("packContent.notFound")}
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
              const enabled = item.unknown
                ? item.install === true
                : item.enabled !== false;
              const toggle =
                item.unknown && onToggleInstall
                  ? (value: boolean) => onToggleInstall(item.key, value)
                  : item.optional && onToggle
                    ? (value: boolean) => onToggle(item.key, value)
                    : null;

              return (
                <div
                  key={`${item.key}-${row.index}`}
                  style={{
                    height: `${row.size}px`,
                    transform: `translateY(${row.start}px)`,
                  }}
                  className={cn(
                    "absolute top-0 left-0 flex w-full items-center gap-2 rounded-lg px-2",
                    toggle && "cursor-pointer hover:bg-row-hover",
                  )}
                  onClick={toggle ? () => toggle(!enabled) : undefined}
                >
                  {toggle && (
                    <Checkbox
                      checked={enabled}
                      aria-label={t(
                        item.unknown
                          ? "packContent.install"
                          : "packContent.toggle",
                        { title: item.title },
                      )}
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
                        className={cn("size-full object-cover", !enabled && "opacity-50")}
                      />
                    ) : (
                      <Package className="size-3 text-faint" />
                    )}
                  </span>

                  <Hint content={item.title} variant="text" truncatedOnly>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-xs",
                        enabled ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {item.title}
                    </span>
                  </Hint>

                  {item.unknown && (
                    <Hint
                      content={t(
                        item.unknown === "unknown"
                          ? "packContent.unknownRow"
                          : "packContent.uncheckedRow",
                      )}
                      className="max-w-64"
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center text-warning">
                        <ShieldQuestion className="size-3.5" />
                      </span>
                    </Hint>
                  )}

                  {item.optional && !item.unknown && !toggle && (
                    <span className="shrink-0 text-3xs text-faint">
                      {t("packContent.optionalShort")}
                    </span>
                  )}

                  <ContentProviderIcon provider={item.provider} className="size-3" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {footer && (
        <footer className="flex h-9 shrink-0 items-center border-t border-border px-2.5">
          {footer}
        </footer>
      )}
    </section>
  );
}
