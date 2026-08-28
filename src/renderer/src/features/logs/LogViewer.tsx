import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Filter,
  Search,
  WrapText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Hint } from "@renderer/components/Hint";
import { LOG_LEVELS, LogEntry, LogLevel, entryText } from "./logParse";
import {
  ALL_LEVELS,
  buildView,
  countLevels,
  highlight,
  nextProblem,
  problemPositions,
} from "./logView";

const LEVEL_TEXT: Record<LogLevel, string> = {
  fatal: "text-destructive",
  error: "text-destructive",
  warn: "text-warning",
  info: "text-foreground",
  debug: "text-faint",
};

const LEVEL_DOT: Record<LogLevel, string> = {
  fatal: "bg-destructive",
  error: "bg-destructive",
  warn: "bg-warning",
  info: "bg-muted-foreground",
  debug: "bg-faint",
};

const LEVEL_BORDER: Record<LogLevel, string> = {
  fatal: "border-l-destructive",
  error: "border-l-destructive",
  warn: "border-l-warning",
  info: "border-l-transparent",
  debug: "border-l-transparent",
};

export interface LogSource {
  id: string;
  label: string;
  hint?: string;
}

export function LogViewer({
  entries,
  loading,
  truncated,
  sources,
  sourceId,
  onSourceChange,
  actions,
  follow,
  onFollowChange,
  startAtEnd = true,
  emptyTitle,
  emptyHint,
  emptyAction,
}: {
  entries: LogEntry[];
  loading: boolean;
  truncated: boolean;
  sources: LogSource[];
  sourceId: string;
  onSourceChange: (id: string) => void;
  actions?: ReactNode;
  follow: boolean;
  onFollowChange: ((value: boolean) => void) | null;
  startAtEnd?: boolean;
  emptyTitle: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
}) {
  const { t } = useTranslation();

  const [levels, setLevels] = useState<LogLevel[]>(ALL_LEVELS);
  const [search, setSearch] = useState("");
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(-1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<LogEntry[] | null>(null);

  const counts = useMemo(() => countLevels(entries), [entries]);
  const view = useMemo(
    () => buildView(entries, { levels, search, onlyMatches }),
    [entries, levels, search, onlyMatches],
  );

  const virtualizer = useVirtualizer({
    count: view.entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 22,
    overscan: 20,
    getItemKey: (index) => view.entries[index].id,
  });

  const total = view.matches.length;
  const problems = useMemo(
    () => problemPositions(view.entries),
    [view.entries],
  );
  const [problemCursor, setProblemCursor] = useState(-1);

  useEffect(() => {
    setCursor(-1);
  }, [search, sourceId]);

  useEffect(() => {
    setProblemCursor(-1);
  }, [sourceId, levels]);

  useEffect(() => {
    setExpanded(new Set());
  }, [sourceId]);

  const jump = useCallback(
    (delta: number) => {
      if (total === 0) return;
      const next =
        cursor < 0
          ? delta > 0
            ? 0
            : total - 1
          : (cursor + delta + total) % total;
      setCursor(next);
      virtualizer.scrollToIndex(view.matches[next], { align: "center" });
    },
    [cursor, total, view.matches, virtualizer],
  );

  useEffect(() => {
    const last = view.entries.length - 1;
    if (last < 0) return;

    if (onFollowChange) {
      if (!follow) return;
    } else {
      if (anchorRef.current === entries) return;
      anchorRef.current = entries;
      if (!startAtEnd) {
        virtualizer.scrollToIndex(0, { align: "start" });
        return;
      }
    }

    virtualizer.scrollToIndex(last, { align: "end" });
  }, [
    entries,
    follow,
    onFollowChange,
    startAtEnd,
    view.entries.length,
    virtualizer,
  ]);

  const handleScroll = () => {
    if (!onFollowChange) return;
    const element = scrollRef.current;
    if (!element) return;

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distance > 80 && follow) onFollowChange(false);
    if (distance <= 8 && !follow) onFollowChange(true);
  };

  const toggleLevel = (level: LogLevel) => {
    setLevels((current) => {
      if (current.length === ALL_LEVELS.length) return [level];
      if (current.includes(level)) {
        const next = current.filter((item) => item !== level);
        return next.length ? next : ALL_LEVELS;
      }
      return [...current, level];
    });
  };

  const allLevels = levels.length === ALL_LEVELS.length;
  const activeMatch = cursor >= 0 ? view.matches[cursor] : -1;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
        {sources.length > 0 && (
          <div
            role="tablist"
            aria-label={t("logs.sourceLabel")}
            className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-3 p-0.5"
          >
            {sources.map((source) => (
              <Tooltip key={source.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={source.id === sourceId}
                    onClick={() => onSourceChange(source.id)}
                    className={cn(
                      "max-w-44 truncate rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      source.id === sourceId
                        ? "bg-surface-1 text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {source.label}
                  </button>
                </TooltipTrigger>
                {source.hint && (
                  <TooltipContent className="max-w-64">
                    {source.hint}
                  </TooltipContent>
                )}
              </Tooltip>
            ))}
          </div>
        )}

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                jump(event.shiftKey ? -1 : 1);
              }
              if (event.key === "Escape" && search) {
                event.preventDefault();
                setSearch("");
              }
            }}
            placeholder={t("logs.searchPlaceholder")}
            className="h-8 pr-24 pl-8 text-xs"
          />

          {search.trim().length > 0 && (
            <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
              <span className="font-mono text-[0.65rem] tabular-nums text-faint">
                {total === 0
                  ? t("logs.noMatches")
                  : `${cursor + 1 || 1}/${total}`}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-6"
                disabled={total === 0}
                aria-label={t("logs.prevMatch")}
                onClick={() => jump(-1)}
              >
                <ChevronUp className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-6"
                disabled={total === 0}
                aria-label={t("logs.nextMatch")}
                onClick={() => jump(1)}
              >
                <ChevronDown className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-6"
                aria-label={t("logs.clearSearch")}
                onClick={() => setSearch("")}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant={onlyMatches ? "secondary" : "ghost"}
              className="size-8 shrink-0"
              aria-pressed={onlyMatches}
              onClick={() => setOnlyMatches((value) => !value)}
            >
              <Filter className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("logs.onlyMatches")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant={wrap ? "secondary" : "ghost"}
              className="size-8 shrink-0"
              aria-pressed={wrap}
              onClick={() => setWrap((value) => !value)}
            >
              <WrapText className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("logs.wrap")}</TooltipContent>
        </Tooltip>

        {onFollowChange && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant={follow ? "secondary" : "ghost"}
                className="size-8 shrink-0"
                aria-pressed={follow}
                onClick={() => onFollowChange(!follow)}
              >
                <ArrowDownToLine className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("logs.follow")}</TooltipContent>
          </Tooltip>
        )}

        {actions}
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <button
          type="button"
          onClick={() => setLevels(ALL_LEVELS)}
          className={cn(
            "rounded-md px-2 py-1 text-[0.7rem] font-medium transition-colors",
            allLevels
              ? "bg-surface-3 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("logs.levels.all")}
          <span className="ml-1 font-mono tabular-nums text-faint">
            {counts.all}
          </span>
        </button>

        {LOG_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            disabled={counts[level] === 0}
            onClick={() => toggleLevel(level)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.7rem] font-medium transition-colors disabled:opacity-40",
              !allLevels && levels.includes(level)
                ? "bg-surface-3 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("size-1.5 rounded-full", LEVEL_DOT[level])} />
            {t(`logs.levels.${level}`)}
            <span className="font-mono tabular-nums text-faint">
              {counts[level]}
            </span>
          </button>
        ))}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="font-mono text-[0.65rem] tabular-nums text-faint">
            {truncated
              ? t("logs.truncated")
              : t("logs.shownLines", { count: view.entries.length })}
          </span>

          {problems.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-1.5 text-[0.65rem] text-destructive"
                  onClick={() => {
                    const target = nextProblem(problems, problemCursor, 1);
                    if (target < 0) return;
                    setProblemCursor(target);
                    virtualizer.scrollToIndex(target, { align: "center" });
                  }}
                >
                  <ArrowDownToLine className="size-3" />
                  {t("logs.jumpToError")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("logs.jumpToErrorHint")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-auto bg-surface-1"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center py-10 text-sm text-muted-foreground">
            {t("logs.loading")}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 py-10 text-center">
            <p className="text-sm text-foreground">{emptyTitle}</p>
            {emptyHint && (
              <p className="max-w-sm text-xs text-muted-foreground">
                {emptyHint}
              </p>
            )}
            {emptyAction && <div className="mt-2">{emptyAction}</div>}
          </div>
        ) : view.entries.length === 0 ? (
          <div className="flex h-full items-center justify-center py-10 text-sm text-muted-foreground">
            {t("logs.nothingMatches")}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const entry = view.entries[item.index];
              const open = expanded.has(entry.id);
              const active = item.index === activeMatch;

              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <div
                    className={cn(
                      "flex min-w-0 gap-2 border-l-2 px-2 py-0.5 font-mono text-[0.7rem] leading-[1.55]",
                      LEVEL_BORDER[entry.level],
                      active ? "bg-primary-soft" : "hover:bg-surface-2/60",
                    )}
                  >
                    {entry.time && (
                      <span className="w-[3.6rem] shrink-0 tabular-nums text-faint">
                        {entry.time}
                      </span>
                    )}

                    {entry.extra.length > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(entry.id)) next.delete(entry.id);
                            else next.add(entry.id);
                            return next;
                          })
                        }
                        className="mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-sm text-faint transition-colors hover:bg-surface-3 hover:text-foreground"
                        aria-expanded={open}
                        aria-label={t("logs.expand", {
                          count: entry.extra.length,
                        })}
                      >
                        <ChevronRight
                          className={cn(
                            "size-3 transition-transform",
                            open && "rotate-90",
                          )}
                        />
                      </button>
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}

                    <div className="min-w-0 flex-1">
                      <Hint
                        variant="text"
                        truncatedOnly
                        className="line-clamp-6 max-w-96 font-mono text-[11px] break-all"
                        content={wrap ? undefined : entry.text}
                      >
                        <span
                          className={cn(
                            "block",
                            LEVEL_TEXT[entry.level],
                            wrap
                              ? "break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
                              : "truncate whitespace-pre",
                          )}
                        >
                          {entry.source && (
                            <span className="mr-1.5 text-faint">
                              {entry.source}
                            </span>
                          )}
                          {entry.repeat > 1 && (
                            <span className="mr-1.5 rounded-sm bg-surface-3 px-1 text-[0.6rem] text-muted-foreground tabular-nums">
                              ×{entry.repeat}
                            </span>
                          )}
                          {highlight(entry.text || entry.raw, search).map(
                            (part, index) =>
                              part.hit ? (
                                <mark
                                  key={index}
                                  className="rounded-[2px] bg-warning/35 text-foreground"
                                >
                                  {part.text}
                                </mark>
                              ) : (
                                <span key={index}>{part.text}</span>
                              ),
                          )}
                        </span>
                      </Hint>

                      {entry.extra.length > 0 &&
                        (open ? (
                          <pre className="mt-0.5 whitespace-pre-wrap text-faint [overflow-wrap:anywhere]">
                            {entry.extra.join("\n")}
                          </pre>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((current) =>
                                new Set(current).add(entry.id),
                              )
                            }
                            className="mt-0.5 text-[0.65rem] text-faint transition-colors hover:text-muted-foreground"
                          >
                            {t("logs.expand", { count: entry.extra.length })}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function visibleLogText(entries: LogEntry[]): string {
  return entries.map(entryText).join("\n");
}
