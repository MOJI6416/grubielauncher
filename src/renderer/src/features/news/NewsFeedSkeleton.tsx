import { Skeleton } from "@/components/ui/skeleton";

export function NewsBodySkeleton() {
  return (
    <div
      aria-busy
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
    >
      <div className="grid shrink-0 grid-cols-12 gap-3">
        <Skeleton className="col-span-7 h-[15rem] rounded-xl" />
        <div className="col-span-5 flex flex-col gap-3">
          <Skeleton className="h-[4.5rem] rounded-xl" />
          <Skeleton className="h-[4.5rem] rounded-xl" />
          <Skeleton className="h-[4.5rem] rounded-xl" />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-[11rem] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function NewsFeedSkeleton() {
  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex h-8 shrink-0 items-center gap-2">
        <Skeleton className="h-6 w-40 rounded-lg" />
        <Skeleton className="ml-auto h-8 w-8 rounded-lg" />
      </div>

      <NewsBodySkeleton />
    </section>
  );
}
