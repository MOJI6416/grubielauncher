import { Skeleton } from "@/components/ui/skeleton";

export function ScreenFallback({ rows = 6 }: { rows?: number }) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4">
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="ml-auto h-9 w-32 rounded-lg" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </section>
  );
}
