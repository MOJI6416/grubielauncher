"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";

import { cn } from "@/lib/utils";

export interface VirtualizedSelectOption {
  value: string;
  label: string;
  secondaryLabel?: string;
  badge?: { label: string; className?: string };
}

const ROW_HEIGHT = 32;
const MAX_VISIBLE_ROWS = 8;
const ROW_HORIZONTAL_SPACE = 6 + 32 + 8 + 8;
const BADGE_SPACE = 56;
const SCROLL_EASING = 0.18;

let measureCanvas: HTMLCanvasElement | null = null;

function getMaxLabelWidth(
  options: VirtualizedSelectOption[],
  font: string,
): number {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const context = measureCanvas.getContext("2d");
  if (!context) return 0;

  context.font = font;
  let max = 0;
  for (const option of options) {
    let text = option.label;
    if (option.secondaryLabel) text += `    ${option.secondaryLabel}`;
    let width = context.measureText(text).width;
    if (option.badge) width += BADGE_SPACE;
    if (width > max) max = width;
  }
  return max;
}

function OptionContent({
  option,
  showSecondary = true,
}: {
  option: VirtualizedSelectOption;
  showSecondary?: boolean;
}) {
  return (
    <>
      {option.badge && (
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] leading-none font-medium",
            option.badge.className,
          )}
        >
          {option.badge.label}
        </span>
      )}
      <span className="truncate">{option.label}</span>
      {showSecondary && option.secondaryLabel && (
        <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground tabular-nums">
          {option.secondaryLabel}
        </span>
      )}
    </>
  );
}

interface RowData {
  options: VirtualizedSelectOption[];
  selectedValue: string;
  activeIndex: number;
  onSelect: (value: string) => void;
  onActivate: (index: number) => void;
}

function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const option = data.options[index];
  const isSelected = option.value === data.selectedValue;
  const isActive = index === data.activeIndex;

  return (
    <div style={style} className="px-1">
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        tabIndex={-1}
        onClick={() => data.onSelect(option.value)}
        onMouseMove={() => data.onActivate(index)}
        title={
          option.secondaryLabel
            ? `${option.label} · ${option.secondaryLabel}`
            : option.label
        }
        className={cn(
          "relative flex h-full w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-none select-none",
          isActive && "bg-accent text-accent-foreground",
        )}
      >
        <OptionContent option={option} />
        {isSelected && (
          <span className="absolute right-2 flex size-4 items-center justify-center">
            <CheckIcon className="size-4" />
          </span>
        )}
      </button>
    </div>
  );
}

export function VirtualizedSelect({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  size = "default",
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: VirtualizedSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [contentWidth, setContentWidth] = React.useState<number>();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<FixedSizeList>(null);
  const scrollBoundsRef = React.useRef({ maxScroll: 0, listHeight: 0 });
  const cleanupWheelRef = React.useRef<(() => void) | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(normalized),
    );
  }, [options, query]);

  const listHeight = Math.min(options.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT;
  const maxScroll = Math.max(0, filtered.length * ROW_HEIGHT - listHeight);
  scrollBoundsRef.current = { maxScroll, listHeight };

  React.useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger || options.length === 0) {
      setContentWidth(undefined);
      return;
    }

    const style = window.getComputedStyle(trigger);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const maxLabel = getMaxLabelWidth(options, font);
    setContentWidth(Math.ceil(maxLabel) + ROW_HORIZONTAL_SPACE);
  }, [options]);

  const setListOuterRef = React.useCallback((node: HTMLDivElement | null) => {
    cleanupWheelRef.current?.();
    cleanupWheelRef.current = null;
    if (!node) return;

    let animationFrame: number | null = null;
    let animatedOffset = 0;
    let targetOffset = 0;

    const step = () => {
      const diff = targetOffset - animatedOffset;
      if (Math.abs(diff) <= 0.5) {
        animatedOffset = targetOffset;
        listRef.current?.scrollTo(targetOffset);
        animationFrame = null;
        return;
      }
      animatedOffset += diff * SCROLL_EASING;
      listRef.current?.scrollTo(animatedOffset);
      animationFrame = requestAnimationFrame(step);
    };

    const handleWheel = (event: WheelEvent) => {
      const { maxScroll, listHeight } = scrollBoundsRef.current;
      if (maxScroll <= 0) return;

      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= ROW_HEIGHT;
      else if (event.deltaMode === 2) delta *= listHeight;

      if (animationFrame === null) {
        animatedOffset = node.scrollTop;
        targetOffset = node.scrollTop;
      }

      const next = Math.max(0, Math.min(targetOffset + delta, maxScroll));
      if (next === targetOffset) return;

      event.preventDefault();
      targetOffset = next;
      if (animationFrame === null) animationFrame = requestAnimationFrame(step);
    };

    node.addEventListener("wheel", handleWheel, { passive: false });
    cleanupWheelRef.current = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      node.removeEventListener("wheel", handleWheel);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;

    const selectedIndex = filtered.findIndex(
      (option) => option.value === value,
    );
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(nextIndex);

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      listRef.current?.scrollToItem(nextIndex, "center");
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (open) listRef.current?.scrollToItem(activeIndex, "smart");
  }, [activeIndex, open]);

  function commit(nextValue: string) {
    onValueChange(nextValue);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case "Enter": {
        event.preventDefault();
        const option = filtered[activeIndex];
        if (option) commit(option.value);
        break;
      }
    }
  }

  const rowData: RowData = {
    options: filtered,
    selectedValue: value,
    activeIndex,
    onSelect: commit,
    onActivate: setActiveIndex,
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        if (next) setQuery("");
        setOpen(next);
      }}
    >
      <PopoverPrimitive.Trigger
        ref={triggerRef}
        data-slot="virtualized-select-trigger"
        data-size={size}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-1 text-sm leading-5 whitespace-nowrap transition-[color,box-shadow,border-color] outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-ring data-[size=default]:h-9 data-[size=sm]:h-8 dark:bg-input/30 [&_svg]:pointer-events-none [&_svg]:shrink-0",
          className,
        )}
      >
        {selectedOption ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <OptionContent option={selectedOption} showSecondary={false} />
          </span>
        ) : (
          <span className="block min-w-0 flex-1 truncate text-left text-muted-foreground">
            {placeholder}
          </span>
        )}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          style={{ width: contentWidth ?? "var(--radix-popover-trigger-width)" }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onKeyDown={handleKeyDown}
          className="z-50 min-w-(--radix-popover-trigger-width) max-w-[min(32rem,var(--radix-popover-content-available-width))] overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <div className="flex items-center gap-2 border-b px-2.5">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              placeholder={searchPlaceholder}
              autoComplete="off"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="p-1" style={{ height: listHeight + 8 }}>
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              <FixedSizeList
                ref={listRef}
                outerRef={setListOuterRef}
                height={listHeight}
                width="100%"
                itemCount={filtered.length}
                itemSize={ROW_HEIGHT}
                itemData={rowData}
                overscanCount={4}
              >
                {Row}
              </FixedSizeList>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
