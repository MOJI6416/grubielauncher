import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Minus, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ModpackDiff,
  ModpackDiffEntry,
  isEmptyDiff,
} from "@/shared/modpackDiff";
import { useLoadOnScroll } from "@renderer/utilities/useLoadOnScroll";

const PREVIEW_LIMIT = 6;
const PAGE_SIZE = 40;

function Bucket({
  entries,
  label,
  tone,
  icon: Icon,
  limit,
}: {
  entries: ModpackDiffEntry[];
  label: string;
  tone: string;
  icon: typeof Plus;
  limit: number;
}) {
  if (!entries.length) return null;

  const shown = entries.slice(0, limit);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[0.7rem] font-medium tracking-wide uppercase">
        <Icon className={`size-3 ${tone}`} />
        <span className={tone}>{label}</span>
        <span className="font-mono text-faint">{entries.length}</span>
      </div>

      <div className="flex flex-col gap-0.5 pl-4">
        {shown.map((entry) => (
          <div
            key={entry.key}
            className="flex min-w-0 items-baseline gap-2 text-xs"
          >
            <span className="truncate text-foreground">{entry.title}</span>
            {entry.fromVersion && entry.toVersion && (
              <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                {entry.fromVersion} → {entry.toVersion}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ModpackDiffPanel({
  diff,
  fill = false,
  maxHeight = "14rem",
}: {
  diff: ModpackDiff;
  fill?: boolean;
  maxHeight?: string;
}) {
  const [limit, setLimit] = useState(
    fill ? Number.POSITIVE_INFINITY : PREVIEW_LIMIT,
  );
  const { t } = useTranslation();

  const longest = Math.max(
    diff.added.length,
    diff.updated.length,
    diff.removed.length,
  );
  const setViewport = useLoadOnScroll(
    limit < longest,
    () => setLimit((value) => value + PAGE_SIZE),
    limit,
  );
  const attachScrollArea = useCallback(
    (node: HTMLDivElement | null) =>
      setViewport(
        node?.querySelector<HTMLElement>(
          '[data-slot="scroll-area-viewport"]',
        ) ?? null,
      ),
    [setViewport],
  );

  if (isEmptyDiff(diff)) return null;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3",
        fill && "flex h-full min-h-0 flex-col",
      )}
    >
      <ScrollArea
        ref={attachScrollArea}
        className={cn(fill && "min-h-0 flex-1")}
        style={fill ? undefined : { maxHeight }}
      >
        <div className="flex flex-col gap-3 pr-2">
          <Bucket
            entries={diff.updated}
            label={t("modpackDiff.updated")}
            tone="text-foreground"
            icon={ArrowUpRight}
            limit={limit}
          />
          <Bucket
            entries={diff.added}
            label={t("modpackDiff.added")}
            tone="text-success"
            icon={Plus}
            limit={limit}
          />
          <Bucket
            entries={diff.removed}
            label={t("modpackDiff.removed")}
            tone="text-destructive"
            icon={Minus}
            limit={limit}
          />
        </div>
      </ScrollArea>

      <div className="mt-2 flex shrink-0 items-center gap-2">
        <span className="text-[0.7rem] text-faint">
          {t("modpackDiff.unchanged", { count: diff.unchanged })}
        </span>
      </div>
    </div>
  );
}
