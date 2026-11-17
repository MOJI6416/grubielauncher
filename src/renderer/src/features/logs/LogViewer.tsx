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
  ScrollText,
  Search,
  WrapText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useAtomValue } from "jotai";
import { streamerActiveAtom } from "@renderer/features/streamer/streamerMode";
import { settingsAtom } from "@renderer/stores/atoms";
import { redactText } from "@renderer/features/streamer/redact";

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

const LOADING_WIDTHS = [72, 58, 84, 46, 66, 90, 52, 78, 61, 70];

export interface LogSource {
  id: string;
  label: string;
  hint?: string;
}

const redactedEntries = new WeakMap<LogEntry, LogEntry>();

function redactEntry(entry: LogEntry): LogEntry {
  let redacted = redactedEntries.get(entry);
  if (!redacted) {
    redacted = {
      ...entry,
      text: redactText(entry.text),
      raw: redactText(entry.raw),
      extra: entry.extra.map(redactText),
    };
    redactedEntries.set(entry, redacted);
  }
  return redacted;
}

export function LogViewer({
  entries: sourceEntries,
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
  const isStreaming = useAtomValue(streamerActiveAtom);
  const logFontSize = useAtomValue(settingsAtom).logFontSize;
  const entries = useMemo(
    () => (isStreaming ? sourceEntries.map(redactEntry) : sourceEntries),
    [isStreaming, sourceEntries],
  );

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
    estimateSize: () => logFontSize * 2,
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
          <SegmentedControl
            value={sourceId}
            ariaLabel={t("logs.sourceLabel")}
            className="max-w-[55%]"
            options={sources.map((source) => ({
              value: source.id,
              label: source.label,
              hint: source.hint,
            }))}
            onChange={onSourceChange}
          />
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
              <span className="font-mono text-3xs tabular-nums text-faint">
                {total === 0
                  ? t("logs.noMatches")
                  : `${cursor + 1 || 1}/${total}`}
              </span>
              <Hint content={total === 0 ? undefined : t("logs.prevMatch")}>
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
              </Hint>
              <Hint content={total === 0 ? undefined : t("logs.nextMatch")}>
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
              </Hint>
              <Hint content={t("logs.clearSearch")}>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-6"
                  aria-label={t("logs.clearSearch")}
                  onClick={() => setSearch("")}
                >
                  <X className="size-3.5" />
                </Button>
              </Hint>
            </div>
          )}
        </div>

        <Hint content={t("logs.onlyMatches")}>
          <Button
            size="icon-sm"
            variant={onlyMatches ? "secondary" : "ghost"}
            className="size-8 shrink-0"
            aria-pressed={onlyMatches}
            aria-label={t("logs.onlyMatches")}
            onClick={() => setOnlyMatches((value) => !value)}
          >
            <Filter className="size-3.5" />
          </Button>
        </Hint>

        <Hint content={t("logs.wrap")}>
          <Button
            size="icon-sm"
            variant={wrap ? "secondary" : "ghost"}
            className="size-8 shrink-0"
            aria-pressed={wrap}
            aria-label={t("logs.wrap")}
            onClick={() => setWrap((value) => !value)}
          >
            <WrapText className="size-3.5" />
          </Button>
        </Hint>

        {onFollowChange && (
          <Hint content={t("logs.follow")}>
            <Button
              size="icon-sm"
              variant={follow ? "secondary" : "ghost"}
              className="size-8 shrink-0"
              aria-pressed={follow}
              aria-label={t("logs.follow")}
              onClick={() => onFollowChange(!follow)}
            >
              <ArrowDownToLine className="size-3.5" />
            </Button>
          </Hint>
        )}

        {actions}
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <button
          type="button"
          aria-pressed={allLevels}
          onClick={() => setLevels(ALL_LEVELS)}
          className={cn(
            "rounded-md px-2 py-1 text-2xs font-medium transition-colors",
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
            aria-pressed={!allLevels && levels.includes(level)}
            onClick={() => toggleLevel(level)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium transition-colors disabled:opacity-40",
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
          <span className="font-mono text-3xs tabular-nums text-faint">
            {truncated
              ? t("logs.truncated")
              : t("logs.shownLines", { count: view.entries.length })}
          </span>

          {problems.length > 0 && (
            <Hint content={t("logs.jumpToErrorHint")}>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-1.5 text-3xs text-destructive"
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
            </Hint>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-auto bg-surface-1"
      >
        {loading ? (
          <div aria-busy className="flex flex-col gap-1.5 px-3 py-2">
            {LOADING_WIDTHS.map((width, index) => (
              <Skeleton
                key={index}
                className="h-3 rounded"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <Empty className="h-full border-0 bg-transparent">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScrollText />
              </EmptyMedia>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              {emptyHint && <EmptyDescription>{emptyHint}</EmptyDescription>}
            </EmptyHeader>
            {emptyAction}
          </Empty>
        ) : view.entries.length === 0 ? (
          <Empty className="h-full border-0 bg-transparent">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Filter />
              </EmptyMedia>
              <EmptyTitle>{t("logs.nothingMatches")}</EmptyTitle>
            </EmptyHeader>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSearch("");
                setOnlyMatches(false);
                setLevels(ALL_LEVELS);
              }}
            >
              {t("modManager.resetFilters")}
            </Button>
          </Empty>
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
                      "flex min-w-0 gap-2 border-l-2 px-2 py-0.5 font-mono leading-[1.55]",
                      LEVEL_BORDER[entry.level],
                      active ? "bg-row-selected" : "hover:bg-row-hover",
                    )}
                    style={{ fontSize: logFontSize }}
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

                    <div className="min-w-0 flex-1 select-text">
                      <Hint
                        variant="text"
                        truncatedOnly
                        className="line-clamp-6 max-w-96 font-mono text-2xs break-all"
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
                            <span className="mr-1.5 rounded-sm bg-surface-3 px-1 text-3xs text-muted-foreground tabular-nums">
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
                            className="mt-0.5 text-3xs text-faint transition-colors hover:text-muted-foreground"
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
