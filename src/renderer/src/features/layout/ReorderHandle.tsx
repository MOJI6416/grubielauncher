import { useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { placeNav, type NavSlot } from "./layout";
import { moveNavSlot, updateLayout } from "./useLayout";

export function useNavDrag() {
  const dragged = useRef<NavSlot | null>(null);
  const [over, setOver] = useState<NavSlot | null>(null);

  return (slot: NavSlot) => ({
    draggable: true,
    "data-drop-target": over === slot && dragged.current !== slot ? "" : undefined,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      dragged.current = slot;
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", slot);
      } catch {}
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!dragged.current) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (over !== slot) setOver(slot);
    },
    onDragLeave: () => {
      if (over === slot) setOver(null);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      const from = dragged.current;
      dragged.current = null;
      setOver(null);
      if (!from || from === slot) return;
      event.preventDefault();
      updateLayout((current) => placeNav(current, from, slot));
    },
    onDragEnd: () => {
      dragged.current = null;
      setOver(null);
    },
  });
}

export function ReorderHandle({
  slot,
  label,
  index,
  count,
  className,
}: {
  slot: NavSlot;
  label: string;
  index: number;
  count: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  const text = t("layout.reorder", { name: label });

  useLayoutEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    ref.current?.focus();
  }, [index]);

  return (
    <Hint content={text} side="right">
      <button
        ref={ref}
        type="button"
        aria-label={text}
        onKeyDown={(event) => {
          const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
          if (!delta) return;
          event.preventDefault();
          event.stopPropagation();
          const target = index + delta;
          if (target < 0 || target >= count) return;
          moved.current = true;
          moveNavSlot(slot, delta);
        }}
        className={cn(
          "flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-faint transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing",
          className,
        )}
      >
        <GripVertical className="size-3.5" />
      </button>
    </Hint>
  );
}
