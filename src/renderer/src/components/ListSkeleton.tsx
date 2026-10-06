import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TITLE_WIDTHS = ["w-2/5", "w-1/3", "w-1/2", "w-1/4", "w-2/5", "w-1/3"];
const LINE_WIDTHS = ["w-3/5", "w-1/2", "w-2/3", "w-2/5", "w-1/2", "w-3/5"];

export function ListSkeleton({
  rows = 8,
  rowClassName = "h-14",
  iconClassName = "size-9 rounded-lg",
  className,
}: {
  rows?: number;
  rowClassName?: string;
  iconClassName?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("flex min-h-0 flex-col overflow-hidden", className)}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={cn(
            "flex shrink-0 items-center gap-2.5 px-2",
            rowClassName,
          )}
        >
          <Skeleton className={cn("shrink-0", iconClassName)} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton
              className={cn(
                "h-3 rounded",
                TITLE_WIDTHS[index % TITLE_WIDTHS.length],
              )}
            />
            <Skeleton
              className={cn(
                "h-2.5 rounded",
                LINE_WIDTHS[index % LINE_WIDTHS.length],
              )}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TileSkeleton({
  tiles = 8,
  className,
}: {
  tiles?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid min-h-0 grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] content-start gap-2.5 overflow-hidden",
        className,
      )}
    >
      {Array.from({ length: tiles }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-xl bg-surface-2 p-2"
        >
          <Skeleton className="aspect-[4/5] w-full rounded-lg" />
          <Skeleton className="h-3 w-3/5 rounded" />
        </div>
      ))}
    </div>
  );
}
