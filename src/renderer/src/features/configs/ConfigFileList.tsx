import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  ChevronRight,
  FileSearch,
  FileX,
  FolderOpen,
  History,
  Loader2,
  Package,
  Search,
  TextSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { ProjectIcon } from "@renderer/features/mods/ProjectIcon";
import type { ConfigEntry } from "./configFiles";
import type { ConfigGroup } from "./modGroups";
import { FileMatches, LineMatch, MIN_CONTENT_QUERY } from "./contentSearch";

export type ConfigSearchMode = "files" | "content";

export interface ContentSearchState {
  results: FileMatches[];
  isLoading: boolean;
  done: number;
  total: number;
}

function EntryButton({
  entry,
  isSelected,
  isDirty,
  hasHistory,
  isMissing,
  indent,
  onOpen,
}: {
  entry: ConfigEntry;
  isSelected: boolean;
  isDirty: boolean;
  hasHistory: boolean;
  isMissing: boolean;
  indent?: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Hint content={entry.relative} variant="text" side="right">
      <button
        type="button"
        aria-current={isSelected}
        onClick={onOpen}
        className={cn(
          "flex w-full min-w-0 flex-col rounded-lg py-1.5 pr-2 text-left transition-colors hover:bg-accent/40 aria-[current=true]:bg-accent/60",
          indent ? "pl-7" : "pl-2",
        )}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-xs font-medium",
              isMissing && "text-faint line-through",
            )}
          >
            {entry.name}
          </span>
          {isDirty && (
            <span
              aria-label={t("configs.unsaved")}
              className="size-1.5 shrink-0 rounded-full bg-primary"
            />
          )}
          {isMissing ? (
            <FileX className="ml-auto size-3 shrink-0 text-faint" aria-hidden />
          ) : (
            hasHistory && (
              <History
                className="ml-auto size-3 shrink-0 text-faint"
                aria-hidden
              />
            )
          )}
        </span>
        {entry.folder && (
          <span className="w-full truncate font-mono text-[0.65rem] text-faint">
            {entry.folder}
          </span>
        )}
      </button>
    </Hint>
  );
}

function MatchPreview({ match }: { match: LineMatch }) {
  const before = match.preview.slice(0, match.previewColumn);
  const hit = match.preview.slice(
    match.previewColumn,
    match.previewColumn + match.length,
  );
  const after = match.preview.slice(match.previewColumn + match.length);

  return (
    <span className="min-w-0 flex-1 truncate font-mono text-[0.65rem] text-muted-foreground">
      {before}
      <mark className="rounded-[2px] bg-warning/30 text-foreground">{hit}</mark>
      {after}
    </span>
  );
}

export function ConfigFileList({
  entries,
  groups,
  isGrouped,
  canGroup,
  selectedKey,
  dirtyKeys,
  historyKeys,
  missingKeys,
  query,
  searchMode,
  content,
  onQueryChange,
  onSearchModeChange,
  onToggleGrouped,
  onOpen,
  onOpenMatch,
  onOpenFolder,
}: {
  entries: ConfigEntry[];
  groups: ConfigGroup[] | null;
  isGrouped: boolean;
  canGroup: boolean;
  selectedKey: string;
  dirtyKeys: ReadonlySet<string>;
  historyKeys: ReadonlySet<string>;
  missingKeys: ReadonlySet<string>;
  query: string;
  searchMode: ConfigSearchMode;
  content: ContentSearchState;
  onQueryChange: (value: string) => void;
  onSearchModeChange: (mode: ConfigSearchMode) => void;
  onToggleGrouped: () => void;
  onOpen: (entry: ConfigEntry) => void;
  onOpenMatch: (entry: ConfigEntry, match: LineMatch) => void;
  onOpenFolder: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const needle = query.trim().toLowerCase();
  const matchesQuery = (entry: ConfigEntry) =>
    !needle || entry.relative.toLowerCase().includes(needle);

  const renderEntry = (entry: ConfigEntry, indent = false) => (
    <EntryButton
      key={entry.relative}
      entry={entry}
      indent={indent}
      isSelected={entry.relative === selectedKey}
      isDirty={dirtyKeys.has(entry.relative)}
      hasHistory={historyKeys.has(entry.relative)}
      isMissing={missingKeys.has(entry.relative)}
      onOpen={() => onOpen(entry)}
    />
  );

  const emptyState = (text: string) => (
    <div className="px-2 py-6 text-center">
      <p className="text-xs text-muted-foreground">{text}</p>
      {query && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-7 text-xs text-muted-foreground"
          onClick={() => onQueryChange("")}
        >
          {t("configs.clearSearch")}
        </Button>
      )}
    </div>
  );

  const renderFiles = () => {
    if (isGrouped && groups) {
      const visibleGroups = groups
        .map((group) => ({
          ...group,
          entries: group.entries.filter(matchesQuery),
        }))
        .filter((group) => group.entries.length > 0);

      if (!visibleGroups.length) return emptyState(t("configs.notFound"));

      return visibleGroups.map((group) => {
        const isOpen =
          !!needle ||
          expanded.has(group.key) ||
          group.entries.some((entry) => entry.relative === selectedKey);

        const groupIcon = (
          <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2 text-faint">
            {group.isMod ? (
              <ProjectIcon
                src={group.iconUrl}
                size={16}
                fallback={<Package className="size-3" />}
              />
            ) : (
              <Boxes className="size-3" />
            )}
          </span>
        );

        if (group.isMod && group.entries.length === 1) {
          const entry = group.entries[0];
          return (
            <Hint
              key={group.key}
              content={entry.relative}
              variant="text"
              side="right"
            >
              <button
                type="button"
                aria-current={entry.relative === selectedKey}
                onClick={() => onOpen(entry)}
                className="flex w-full min-w-0 items-center gap-1.5 rounded-lg py-1 pr-2 pl-6 text-left transition-colors hover:bg-accent/40 aria-[current=true]:bg-accent/60"
              >
                {groupIcon}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate text-xs text-foreground",
                        missingKeys.has(entry.relative) &&
                          "text-faint line-through",
                      )}
                    >
                      {group.title}
                    </span>
                    {dirtyKeys.has(entry.relative) && (
                      <span
                        aria-label={t("configs.unsaved")}
                        className="size-1.5 shrink-0 rounded-full bg-primary"
                      />
                    )}
                  </span>
                  <span className="truncate font-mono text-[0.65rem] text-faint">
                    {entry.relative}
                  </span>
                </span>
                {missingKeys.has(entry.relative) ? (
                  <FileX className="size-3 shrink-0 text-faint" aria-hidden />
                ) : (
                  historyKeys.has(entry.relative) && (
                    <History
                      className="size-3 shrink-0 text-faint"
                      aria-hidden
                    />
                  )
                )}
              </button>
            </Hint>
          );
        }

        return (
          <div key={group.key} className="flex flex-col gap-0.5">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (isOpen) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })
              }
              className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 text-left transition-colors hover:bg-accent/40"
            >
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 text-faint transition-transform",
                  isOpen && "rotate-90",
                )}
              />
              {groupIcon}
              <Hint content={group.title} variant="text" truncatedOnly>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {group.title}
                </span>
              </Hint>
              <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
                {group.entries.length}
              </span>
            </button>
            {isOpen && group.entries.map((entry) => renderEntry(entry, true))}
          </div>
        );
      });
    }

    const visible = entries.filter(matchesQuery);
    if (!visible.length) return emptyState(t("configs.notFound"));
    return visible.map((entry) => renderEntry(entry));
  };

  const renderContent = () => {
    if (query.trim().length < MIN_CONTENT_QUERY) {
      return (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {t("configs.contentSearch.hint")}
        </p>
      );
    }

    if (content.isLoading && !content.results.length) {
      return (
        <p className="flex items-center justify-center gap-2 px-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("configs.contentSearch.reading", {
            done: content.done,
            total: content.total,
          })}
        </p>
      );
    }

    if (!content.results.length)
      return emptyState(t("configs.contentSearch.none"));

    const byKey = new Map(entries.map((entry) => [entry.relative, entry]));

    return content.results.map((result) => {
      const entry = byKey.get(result.relative);
      if (!entry) return null;

      return (
        <div key={result.relative} className="flex flex-col gap-0.5 pb-1">
          <button
            type="button"
            onClick={() => onOpen(entry)}
            className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 pt-1.5 pb-0.5 text-left hover:bg-accent/40"
          >
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {entry.name}
            </span>
            <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
              {result.total}
            </span>
          </button>
          {result.matches.map((match) => (
            <button
              key={match.line}
              type="button"
              onClick={() => onOpenMatch(entry, match)}
              className="flex min-w-0 items-center gap-2 rounded-md py-0.5 pr-2 pl-3 text-left hover:bg-accent/40"
            >
              <span className="w-7 shrink-0 text-right font-mono text-[0.6rem] tabular-nums text-faint">
                {match.line + 1}
              </span>
              <MatchPreview match={match} />
            </button>
          ))}
          {result.total > result.matches.length && (
            <span className="pl-12 text-[0.6rem] text-faint">
              {t("configs.contentSearch.more", {
                count: result.total - result.matches.length,
              })}
            </span>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex min-h-0 flex-col gap-2 rounded-xl border bg-card p-2">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
        <Input
          value={query}
          className="h-8 pl-8 text-xs"
          aria-label={t("common.search")}
          placeholder={
            searchMode === "content"
              ? t("configs.contentSearch.placeholder")
              : t("common.search")
          }
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              event.stopPropagation();
              onQueryChange("");
            }
          }}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
          {(["files", "content"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={searchMode === mode}
              onClick={() => onSearchModeChange(mode)}
              className="flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[0.68rem] text-muted-foreground transition-colors not-aria-pressed:hover:text-foreground aria-pressed:bg-surface-3 aria-pressed:text-foreground"
            >
              {mode === "files" ? (
                <FileSearch className="size-3 shrink-0" />
              ) : (
                <TextSearch className="size-3 shrink-0" />
              )}
              <span className="truncate">
                {t(`configs.searchMode.${mode}`)}
              </span>
            </button>
          ))}
        </div>

        {canGroup && searchMode === "files" && (
          <Hint content={t(isGrouped ? "configs.groupOff" : "configs.groupOn")}>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-pressed={isGrouped}
              aria-label={t(isGrouped ? "configs.groupOff" : "configs.groupOn")}
              className={cn(
                "size-7",
                isGrouped ? "text-foreground" : "text-faint",
              )}
              onClick={onToggleGrouped}
            >
              {groups === null && isGrouped ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Boxes className="size-3.5" />
              )}
            </Button>
          </Hint>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 pr-2">
          {searchMode === "content" ? renderContent() : renderFiles()}
        </div>
      </ScrollArea>

      <Button
        variant="ghost"
        size="sm"
        className="justify-start bg-transparent text-muted-foreground"
        onClick={onOpenFolder}
      >
        <FolderOpen className="size-3.5" />
        {t("common.openFolder")}
      </Button>
    </div>
  );
}
