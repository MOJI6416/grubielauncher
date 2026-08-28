import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { InstanceTab } from "@renderer/navigation/routes";
import { cn } from "@/lib/utils";
import type { InstanceTabItem } from "./instanceTabs";

export function InstanceTabBar({
  items,
  active,
  onSelect,
}: {
  items: InstanceTabItem[];
  active: InstanceTab;
  onSelect: (tab: InstanceTab) => void;
}) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);

  const focusAt = (index: number) => {
    const buttons =
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[role='tab']",
      );
    if (!buttons?.length) return;

    const bounded = (index + buttons.length) % buttons.length;
    buttons[bounded].focus();
    onSelect(items[bounded].id);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={t("versions.tabsLabel")}
      className="flex min-w-0 flex-1 items-center"
      onKeyDown={(event) => {
        const index = items.findIndex((item) => item.id === active);
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
          focusAt(items.length - 1);
        }
      }}
    >
      {items.map((item) => {
        const selected = item.id === active;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`instance-tab-${item.id}`}
            aria-selected={selected}
            aria-controls="instance-tabpanel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(item.id)}
            className={cn(
              "-mb-px flex min-w-0 shrink items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[0.82rem] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
              selected
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="truncate">{t(`shell.tabs.${item.id}`)}</span>
            {item.count !== undefined && item.count > 0 && (
              <span className="font-mono text-[0.7rem] text-faint tabular-nums">
                {item.count}
              </span>
            )}
            {item.alert && (
              <span className="size-1.5 shrink-0 rounded-full bg-warning" />
            )}
          </button>
        );
      })}
    </div>
  );
}
