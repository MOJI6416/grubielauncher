import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type PanelFallbackVariant =
  | "rail"
  | "board"
  | "master-detail"
  | "stacked"
  | "card"
  | "roster"
  | "tabs"
  | "wizard"
  | "dialog"
  | "screen";

function Rows({ count, height }: { count: number; height: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className={cn("w-full shrink-0", height)} />
      ))}
    </div>
  );
}

function RailPanel({ railClass }: { railClass: string }) {
  return (
    <div className={cn("grid h-full min-h-0 gap-3", railClass)}>
      <aside className="flex min-h-0 flex-col gap-1.5">
        <div className="flex h-6 shrink-0 items-center justify-between px-1">
          <Skeleton className="h-2.5 w-16 rounded" />
          <Skeleton className="size-5 rounded-md" />
        </div>
        <Rows count={5} height="h-12 rounded-lg" />
        <Skeleton className="mt-auto h-8 w-full shrink-0 rounded-lg" />
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col gap-2.5">
        <div className="flex h-8 shrink-0 items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 min-w-0 flex-1 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <div className="flex h-6 shrink-0 items-center gap-2">
          {[14, 20, 18, 16, 18].map((width, index) => (
            <Skeleton
              key={index}
              className="h-5 rounded-md"
              style={{ width: `${width * 4}px` }}
            />
          ))}
        </div>
        <Skeleton className="min-h-0 w-full flex-1 rounded-xl" />
      </section>
    </div>
  );
}

function BoardPanel() {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center gap-2 pb-2.5">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-8 min-w-0 flex-1 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function MasterDetailPanel() {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_21rem] gap-3">
      <section className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-2.5">
        <div className="flex h-8 shrink-0 items-center gap-2">
          <Skeleton className="h-8 min-w-0 flex-1 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <Rows count={5} height="h-13 rounded-lg" />
      </section>

      <aside className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-2.5">
        <Skeleton className="h-24 w-full shrink-0 rounded-lg" />
        <Skeleton className="h-4 w-2/3 shrink-0 rounded" />
        <Skeleton className="h-3 w-1/2 shrink-0 rounded" />
        <Rows count={3} height="h-9 rounded-lg" />
      </aside>
    </div>
  );
}

function StackedPanel() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="flex h-16 shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-3">
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-40 rounded" />
          <Skeleton className="h-2.5 w-24 rounded" />
        </div>
        <Skeleton className="h-8 w-24 shrink-0 rounded-lg" />
      </div>

      <Skeleton className="min-h-0 w-full rounded-xl" />
    </div>
  );
}

function CardPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        <Skeleton className="size-3.5 shrink-0 rounded" />
        <Skeleton className="h-2.5 w-32 rounded" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
        <Skeleton className="h-3 w-24 shrink-0 rounded" />
        <Skeleton className="h-24 w-full shrink-0 rounded-lg" />
        <Skeleton className="h-3 w-20 shrink-0 rounded" />
        <Skeleton className="min-h-0 w-full flex-1 rounded-lg" />
      </div>
    </section>
  );
}

function RosterPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex h-8 shrink-0 items-center gap-1.5">
        <Skeleton className="h-7 w-24 rounded-lg" />
        <Skeleton className="h-7 w-24 rounded-lg" />
        <Skeleton className="h-7 w-24 rounded-lg" />
        <Skeleton className="ml-auto h-3 w-20 rounded" />
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-h-0 w-[300px] shrink-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-border bg-card p-2">
          <Skeleton className="h-8 w-full shrink-0 rounded-lg" />
          <Rows count={6} height="h-8.5 rounded-lg" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-card p-3">
          <div className="flex h-10 shrink-0 items-center gap-2.5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-36 rounded" />
              <Skeleton className="h-2.5 w-24 rounded" />
            </div>
            <Skeleton className="h-8 w-24 shrink-0 rounded-lg" />
          </div>
          <Skeleton className="min-h-0 w-full flex-1 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function TabsPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border">
        {[20, 16, 14, 18, 15, 16].map((width, index) => (
          <Skeleton
            key={index}
            className="h-7 shrink-0 rounded-lg"
            style={{ width: `${width * 4}px` }}
          />
        ))}
        <Skeleton className="ml-auto h-8 w-28 shrink-0 rounded-lg" />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] gap-3 pt-3">
        <div className="flex min-h-0 flex-col gap-3">
          <Skeleton className="h-28 w-full shrink-0 rounded-xl" />
          <Skeleton className="min-h-0 w-full flex-1 rounded-xl" />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <Skeleton className="h-40 w-full shrink-0 rounded-xl" />
          <Skeleton className="min-h-0 w-full flex-1 rounded-xl" />
        </div>
      </div>
    </section>
  );
}

function WizardPanel() {
  return (
    <section className="flex h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card">
      <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-border bg-surface-1 p-2">
        <Skeleton className="mb-1 h-2.5 w-20 rounded" />
        <Rows count={4} height="h-9 rounded-lg" />
        <Skeleton className="mt-auto h-14 w-full shrink-0 rounded-lg" />
      </nav>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <Skeleton className="h-9 w-full shrink-0 rounded-lg" />
        <Rows count={5} height="h-14 rounded-xl" />
        <Skeleton className="h-11 w-full shrink-0 rounded-lg" />
      </div>
    </section>
  );
}

function DialogPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5 [&_[data-slot=skeleton]]:bg-surface-1">
      <div className="flex shrink-0 items-start gap-2.5">
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-3.5 w-40 rounded" />
          <Skeleton className="h-2.5 w-56 rounded" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Skeleton className="min-h-0 w-full flex-1 rounded-xl" />
        <Skeleton className="h-9 w-full shrink-0 rounded-lg" />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-3.5">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  );
}

function ScreenPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex h-9 shrink-0 items-center gap-2">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="ml-auto h-9 w-32 rounded-lg" />
      </div>
      <Rows count={6} height="h-14 rounded-xl" />
    </div>
  );
}

export function PanelFallback({
  variant = "screen",
  className,
}: {
  variant?: PanelFallbackVariant;
  className?: string;
}) {
  return (
    <div
      aria-busy
      aria-live="polite"
      className={cn("h-full min-h-0 w-full", className)}
    >
      {variant === "rail" ? (
        <RailPanel railClass="grid-cols-[13.5rem_minmax(0,1fr)]" />
      ) : variant === "board" ? (
        <BoardPanel />
      ) : variant === "master-detail" ? (
        <MasterDetailPanel />
      ) : variant === "stacked" ? (
        <StackedPanel />
      ) : variant === "card" ? (
        <CardPanel />
      ) : variant === "roster" ? (
        <RosterPanel />
      ) : variant === "tabs" ? (
        <TabsPanel />
      ) : variant === "wizard" ? (
        <WizardPanel />
      ) : variant === "dialog" ? (
        <DialogPanel />
      ) : (
        <ScreenPanel />
      )}
    </div>
  );
}
