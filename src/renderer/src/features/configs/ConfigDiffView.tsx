import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DiffLine, diffBlocks, diffLines, diffStats } from "./diff";

function Row({ line }: { line: DiffLine }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[3rem_3rem_1rem_minmax(0,1fr)] font-mono text-xs leading-5",
        line.kind === "insert" && "bg-success/10",
        line.kind === "delete" && "bg-destructive/10",
      )}
    >
      <span className="pr-2 text-right text-faint/70 tabular-nums select-none">
        {line.oldLine ?? ""}
      </span>
      <span className="pr-2 text-right text-faint/70 tabular-nums select-none">
        {line.newLine ?? ""}
      </span>
      <span
        className={cn(
          "text-center select-none",
          line.kind === "insert" && "text-success",
          line.kind === "delete" && "text-destructive",
        )}
      >
        {line.kind === "insert" ? "+" : line.kind === "delete" ? "−" : ""}
      </span>
      <span
        className={cn(
          "pr-3 whitespace-pre-wrap break-words",
          line.kind === "equal" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {line.text || " "}
      </span>
    </div>
  );
}

export function ConfigDiffView({
  before,
  after,
  title,
  actions,
}: {
  before: string;
  after: string;
  title: ReactNode;
  actions: ReactNode;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const lines = diffLines(before, after);
  const stats = diffStats(lines);
  const blocks = diffBlocks(lines);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          <span className="min-w-0 truncate font-medium">{title}</span>
          <span className="shrink-0 font-mono tabular-nums text-success">
            +{stats.added}
          </span>
          <span className="shrink-0 font-mono tabular-nums text-destructive">
            −{stats.removed}
          </span>
        </div>
        {actions}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {stats.added === 0 && stats.removed === 0 ? (
          <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t("configs.diff.same")}
          </p>
        ) : (
          blocks.map((block, index) =>
            block.kind === "lines" ? (
              block.lines.map((line, position) => (
                <Row key={`${index}-${position}`} line={line} />
              ))
            ) : expanded.has(index) ? (
              lines
                .slice(
                  blocks
                    .slice(0, index)
                    .reduce(
                      (total, item) =>
                        total +
                        (item.kind === "lines"
                          ? item.lines.length
                          : item.count),
                      0,
                    ),
                )
                .slice(0, block.count)
                .map((line, position) => (
                  <Row key={`${index}-${position}`} line={line} />
                ))
            ) : (
              <button
                key={index}
                type="button"
                onClick={() =>
                  setExpanded((previous) => new Set(previous).add(index))
                }
                className="my-0.5 flex h-6 w-full items-center gap-2 bg-surface-1 px-3 text-left text-[0.68rem] text-faint transition-colors hover:bg-surface-2 hover:text-muted-foreground"
              >
                <ChevronsUpDown className="size-3" />
                {t("configs.diff.hidden", { count: block.count })}
              </button>
            ),
          )
        )}
      </div>
    </div>
  );
}
