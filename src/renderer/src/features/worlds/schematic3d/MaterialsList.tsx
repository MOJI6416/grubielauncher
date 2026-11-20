import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, Search } from "lucide-react";
import type { BlockInfo, ISchematicBlock } from "@/types/Schematic";
import { stackSizeOf } from "@/shared/blockState";
import { DEFAULT_TINT, paintForBlock, resolvePaint } from "@/shared/blockColors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { SortMenu } from "@renderer/components/SortMenu";
import { formatNumber } from "@renderer/utilities/numbers";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { countFeature } from "@renderer/features/usage/usage";

type MaterialSort = "count" | "countAsc" | "name";

const ROW_HEIGHT = 36;

export function BlockIcon({
  id,
  info,
  className,
}: {
  id: string;
  info: BlockInfo;
  className?: string;
}) {
  if (info.icon) {
    return (
      <img
        src={info.icon}
        alt=""
        draggable={false}
        className={cn("size-5 shrink-0 [image-rendering:pixelated]", className)}
      />
    );
  }
  const color = resolvePaint(paintForBlock(id), DEFAULT_TINT);
  return (
    <span
      aria-hidden
      className={cn("size-5 shrink-0 rounded-sm border bg-surface-3", className)}
      style={color ? ({ backgroundColor: `rgb(${color.join(",")})` } as CSSProperties) : undefined}
    />
  );
}

export function useStacksLabel() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  return (id: string, count: number) => {
    const size = stackSizeOf(id);
    if (size === 1) return null;
    const stacks = Math.floor(count / size);
    const rest = count - stacks * size;
    if (stacks === 0) return null;
    return rest
      ? t("schematics.materials.stacks", {
          stacks: formatNumber(stacks, locale),
          size,
          rest: formatNumber(rest, locale),
        })
      : t("schematics.materials.stacksExact", {
          stacks: formatNumber(stacks, locale),
          size,
        });
  };
}

export function MaterialsList({
  title,
  blocks,
  info,
  focusId,
  emptyText,
}: {
  title: string;
  blocks: ISchematicBlock[];
  info: (id: string) => BlockInfo;
  focusId: string | null;
  emptyText: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const stacksLabel = useStacksLabel();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MaterialSort>("count");
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const counted = useRef(false);

  const touch = () => {
    if (counted.current) return;
    counted.current = true;
    countFeature("schematics.materials");
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const named = blocks.map((block) => ({ ...block, name: info(block.id).name }));
    const filtered = needle
      ? named.filter(
          (block) =>
            block.name.toLowerCase().includes(needle) ||
            block.id.toLowerCase().includes(needle),
        )
      : named;
    const collator = new Intl.Collator(locale);
    return [...filtered].sort((left, right) =>
      sort === "name"
        ? collator.compare(left.name, right.name)
        : sort === "countAsc"
          ? left.count - right.count || collator.compare(left.name, right.name)
          : right.count - left.count || collator.compare(left.name, right.name),
    );
  }, [blocks, info, locale, query, sort]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const focusIndex = focusId ? rows.findIndex((row) => row.id === focusId) : -1;
  useEffect(() => {
    if (focusIndex >= 0) virtualizer.scrollToIndex(focusIndex, { align: "center" });
  }, [focusIndex, virtualizer]);

  const copy = async () => {
    const lines = rows.map((row) => {
      const stacks = stacksLabel(row.id, row.count);
      const count = formatNumber(row.count, locale);
      return stacks ? `${row.name}: ${count} (${stacks})` : `${row.name}: ${count}`;
    });
    const copied = await copyWithFeedback(
      [t("schematics.materials.copyHeader", { name: title }), ...lines].join("\n"),
    );
    if (copied) countFeature("schematics.copyMaterials");
  };

  const copyLabel = t("schematics.materials.copy");

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-surface-1">
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b pr-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("schematics.materials.title")}
        </span>
        <span className="shrink-0 font-mono text-3xs whitespace-nowrap text-faint tabular-nums">
          {t("schematics.materials.types", { count: blocks.length })}
        </span>
        <SortMenu
          value={sort}
          className="size-7"
          disabled={blocks.length < 2}
          options={[
            { value: "count", label: t("schematics.materials.sortCount") },
            { value: "countAsc", label: t("schematics.materials.sortCountAsc") },
            { value: "name", label: t("schematics.materials.sortName") },
          ]}
          onChange={(next) => {
            touch();
            setSort(next);
          }}
        />
        <Hint content={copyLabel}>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-7"
            aria-label={copyLabel}
            disabled={rows.length === 0}
            onClick={() => void copy()}
          >
            <Copy className="size-3.5" />
          </Button>
        </Hint>
      </header>

      <div className="relative shrink-0 border-b px-1.5 py-1">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-faint" />
        <Input
          value={query}
          onChange={(event) => {
            touch();
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.stopPropagation();
              setQuery("");
            }
          }}
          placeholder={t("schematics.materials.search")}
          aria-label={t("schematics.materials.search")}
          className="h-7 border-transparent bg-surface-2 pl-7 text-xs"
        />
      </div>

      <div
        ref={setScrollElement}
        role="listbox"
        aria-label={t("schematics.materials.title")}
        className="min-h-0 flex-1 overflow-y-auto p-1"
      >
        {rows.length === 0 ? (
          <Empty className="h-full px-4">
            <EmptyDescription className="text-xs">
              {blocks.length ? t("schematics.materials.notFound") : emptyText}
            </EmptyDescription>
          </Empty>
        ) : (
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const stacks = stacksLabel(row.id, row.count);
              return (
                <div
                  key={row.id}
                  role="option"
                  aria-selected={row.id === focusId}
                  style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
                  className="absolute top-0 left-0 flex w-full min-w-0 items-center gap-2 rounded-lg px-1.5 transition-colors hover:bg-row-hover aria-selected:bg-row-selected"
                >
                  <BlockIcon id={row.id} info={info(row.id)} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Hint content={`${row.name} · ${row.id}`} variant="text" truncatedOnly>
                      <span className="truncate text-xs leading-tight">{row.name}</span>
                    </Hint>
                    {stacks && (
                      <span className="truncate font-mono text-3xs leading-tight text-faint tabular-nums">
                        {stacks}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatNumber(row.count, locale)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
