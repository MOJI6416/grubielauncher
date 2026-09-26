import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";

export function PathText({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  const cut = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  const head = cut >= 0 ? path.slice(0, cut + 1) : "";
  const tail = cut >= 0 ? path.slice(cut + 1) : path;

  return (
    <Hint content={path} variant="text" truncatedOnly>
      <span className={cn("flex min-w-0 font-mono", className)}>
        <span className="truncate">{head}</span>
        <span className="max-w-full shrink-0 truncate">{tail}</span>
      </span>
    </Hint>
  );
}

export function PathRows({
  rows,
  className,
}: {
  rows: { label: string; path: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 space-y-1 rounded-lg border border-border bg-surface-2 px-3 py-2",
        className,
      )}
    >
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 items-baseline gap-2">
          <span className="w-14 shrink-0 text-[0.7rem] text-faint">
            {row.label}
          </span>
          <PathText path={row.path} className="text-xs text-foreground" />
        </div>
      ))}
    </div>
  );
}
