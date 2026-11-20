import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { InstanceTab } from "@renderer/navigation/routes";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSlidingIndicator } from "@renderer/utilities/useSlidingIndicator";
import { fitTabs, type InstanceTabItem } from "./instanceTabs";
import { SlidingIndicator } from "@renderer/components/SlidingIndicator";

const TAB_BOX =
  "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2.5 text-[0.82rem] whitespace-nowrap";
const TAB_STATE =
  "transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none";

function TabLabel({ item }: { item: InstanceTabItem }) {
  const { t } = useTranslation();

  return (
    <>
      <span>{t(`shell.tabs.${item.id}`)}</span>
      {item.count !== undefined && item.count > 0 && (
        <span className="font-mono text-2xs text-faint tabular-nums">
          {item.count}
        </span>
      )}
      {item.alert && (
        <span className="size-1.5 shrink-0 rounded-full bg-warning" />
      )}
    </>
  );
}

function sameTabs(a: InstanceTab[] | null, b: InstanceTab[]): boolean {
  return (
    !!a && a.length === b.length && a.every((id, index) => id === b[index])
  );
}

export function InstanceTabBar({
  items,
  active,
  onSelect,
}: {
  items: InstanceTabItem[];
  active: InstanceTab;
  onSelect: (tab: InstanceTab) => void;
}) {
  const { t, i18n } = useTranslation();
  const indicator = useSlidingIndicator<HTMLDivElement>();
  const frameRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<InstanceTab[] | null>(null);

  const fit = useCallback(() => {
    const frame = frameRef.current;
    const measure = measureRef.current;
    if (!frame || !measure) return;

    const cells = Array.from(measure.children);
    const widths = items.map(
      (_, index) => cells[index]?.getBoundingClientRect().width ?? 0,
    );
    const moreWidth = cells[items.length]?.getBoundingClientRect().width ?? 0;
    const next = fitTabs(
      widths,
      items.findIndex((item) => item.id === active),
      frame.clientWidth,
      moreWidth,
    ).map((index) => items[index].id);

    setShown((previous) => (sameTabs(previous, next) ? previous : next));
  }, [items, active]);

  useLayoutEffect(() => {
    fit();
    const frame = frameRef.current;
    const measure = measureRef.current;
    if (!frame || !measure) return;

    const observer = new ResizeObserver(() => fit());
    observer.observe(frame);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [fit, i18n.language]);

  const visible = shown
    ? items.filter((item) => shown.includes(item.id))
    : items;
  const hidden = shown
    ? items.filter((item) => !shown.includes(item.id))
    : [];

  const focusAt = (index: number) => {
    const buttons =
      indicator.containerRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[role='tab']",
      );
    if (!buttons?.length) return;

    const bounded = (index + buttons.length) % buttons.length;
    buttons[bounded].focus();
    onSelect(visible[bounded].id);
  };

  return (
    <div ref={frameRef} className="relative flex min-w-0 flex-1 items-center">
      <div
        ref={indicator.containerRef}
        role="tablist"
        aria-label={t("versions.tabsLabel")}
        className="relative flex min-w-0 items-center"
        onKeyDown={(event) => {
          const index = visible.findIndex((item) => item.id === active);
          if (index === -1) return;

          if (event.key === "ArrowRight") {
            event.preventDefault();
            focusAt(index + 1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            focusAt(index - 1);
          } else if (event.key === "Home") {
            event.preventDefault();
            focusAt(0);
          } else if (event.key === "End") {
            event.preventDefault();
            focusAt(visible.length - 1);
          }
        }}
      >
        {visible.map((item) => {
          const selected = item.id === active;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`instance-tab-${item.id}`}
              aria-selected={selected}
              aria-controls="instance-tabpanel"
              data-indicator-active={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(item.id)}
              className={cn(
                TAB_BOX,
                TAB_STATE,
                selected
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <TabLabel item={item} />
            </button>
          );
        })}
        <SlidingIndicator indicator={indicator} variant="underline" />
      </div>

      {hidden.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                TAB_BOX,
                TAB_STATE,
                "text-muted-foreground hover:text-foreground data-[state=open]:text-foreground",
              )}
            >
              {t("common.more")}
              <ChevronDown className="size-3.5" />
              {hidden.some((item) => item.alert) && (
                <span className="size-1.5 shrink-0 rounded-full bg-warning" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            {hidden.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => onSelect(item.id)}>
                <TabLabel item={item} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 flex w-max"
      >
        {items.map((item) => (
          <span key={item.id} className={TAB_BOX}>
            <TabLabel item={item} />
          </span>
        ))}
        <span className={TAB_BOX}>
          {t("common.more")}
          <ChevronDown className="size-3.5" />
          <span className="size-1.5 shrink-0" />
        </span>
      </div>
    </div>
  );
}
