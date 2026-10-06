import { cn } from "@/lib/utils";
import type { IndicatorBox } from "@renderer/utilities/useSlidingIndicator";

export function SlidingIndicator({
  indicator,
  variant,
  className,
}: {
  indicator: { box: IndicatorBox | null; visible: boolean; transition: string };
  variant: "fill" | "underline";
  className?: string;
}) {
  const { box, visible, transition } = indicator;
  const x = box?.x ?? 0;

  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-0",
        variant === "fill"
          ? "top-0"
          : "-bottom-px h-0.5 rounded-full bg-primary",
        className,
      )}
      style={{
        width: box?.width ?? 0,
        height: variant === "fill" ? (box?.height ?? 0) : undefined,
        transform:
          variant === "fill"
            ? `translate3d(${x}px, ${box?.y ?? 0}px, 0)`
            : `translate3d(${x}px, 0, 0)`,
        opacity: visible ? 1 : 0,
        transition,
      }}
    />
  );
}
