import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownAZ, Clock, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@renderer/components/Hint";
import { cn } from "@/lib/utils";
import { FriendRow, type FriendRowActions } from "./FriendRow";
import {
  nextFriendIndex,
  steadyRows,
  type FriendFilter,
  type FriendListResult,
  type FriendSort,
} from "./friendsList";

const SECTION_HEIGHT = 26;
const ROW_HEIGHT = 48;

const FILTERS: FriendFilter[] = ["all", "online", "unread"];

const FILTER_LABEL: Record<FriendFilter, string> = {
  all: "friends.filterAll",
  online: "friends.filterOnline",
  unread: "friends.filterUnread",
};

const SECTION_LABEL = {
  playing: "friends.playing",
  online: "friends.online",
  offline: "friends.offline",
} as const;

interface FriendsListPanelProps extends FriendRowActions {
  list: FriendListResult;
  query: string;
  filter: FriendFilter;
  sort: FriendSort;
  isLoading: boolean;
  activeFriendId?: string;
  isGameRunning: boolean;
  isCallBusy: boolean;
  ownUserId?: string;
  voiceRoomId?: string;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: FriendFilter) => void;
  onSortChange: (value: FriendSort) => void;
  onAddFriend: () => void;
  t: TFunction;
}

function useSteadyRows(rows: FriendListResult["rows"]) {
  const [isFrozen, setIsFrozen] = useState(false);
  const frozenRef = useRef<FriendListResult["rows"]>([]);

  if (!isFrozen) frozenRef.current = rows;

  const visible = useMemo(
    () => (isFrozen ? steadyRows(frozenRef.current, rows) : rows),
    [rows, isFrozen],
  );

  return {
    rows: visible,
    freeze: useCallback(() => setIsFrozen(true), []),
    thaw: useCallback(() => setIsFrozen(false), []),
  };
}

export function FriendsListPanel({
  list,
  query,
  filter,
  sort,
  isLoading,
  activeFriendId,
  isGameRunning,
  isCallBusy,
  ownUserId,
  voiceRoomId,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onAddFriend,
  t,
  ...actions
}: FriendsListPanelProps) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const { rows, freeze, thaw } = useSteadyRows(list.rows);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    getItemKey: (index) => rows[index]?.key ?? index,
    estimateSize: (index) =>
      rows[index]?.type === "section" ? SECTION_HEIGHT : ROW_HEIGHT,
    overscan: 6,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const activeIndex = useMemo(
    () =>
      rows.findIndex((row) => row.type === "friend" && row.key === activeFriendId),
    [rows, activeFriendId],
  );

  useEffect(() => {
    if (activeIndex < 0 || !scrollElement) return;
    virtualizer.scrollToIndex(activeIndex, { align: "auto" });
  }, [activeIndex, scrollElement]);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && query) {
        event.preventDefault();
        onQueryChange("");
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();

      const target = nextFriendIndex(
        rowsRef.current,
        activeFriendId,
        event.key === "ArrowDown" ? 1 : -1,
      );
      if (target) actions.onOpenChat(target);
    },
    [actions, activeFriendId, onQueryChange, query],
  );

  return (
    <div className="flex h-full min-h-0 w-[300px] shrink-0 flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-2">
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            placeholder={t("friends.searchPlaceholder")}
            aria-label={t("friends.searchPlaceholder")}
            className="h-8 pr-7 pl-8 text-xs"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {query && (
            <button
              type="button"
              aria-label={t("common.close")}
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-faint hover:text-foreground"
              onClick={() => onQueryChange("")}
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <Hint content={t("friends.addFriend")}>
          <Button
            size="icon-sm"
            variant="secondary"
            className="size-8 shrink-0"
            aria-label={t("friends.addFriend")}
            onClick={onAddFriend}
          >
            <UserPlus className="size-4" />
          </Button>
        </Hint>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            className={cn(
              "h-6 rounded-md px-2 text-[11px] font-medium transition-colors",
              filter === value
                ? "bg-surface-3 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onFilterChange(value)}
          >
            {t(FILTER_LABEL[value])}
          </button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="ml-auto size-6 shrink-0 text-muted-foreground"
              aria-label={t("friends.sortLabel")}
            >
              {sort === "name" ? (
                <ArrowDownAZ className="size-3.5" />
              ) : (
                <Clock className="size-3.5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onSortChange("activity")}>
              <Clock />
              {t("friends.sortActivity")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSortChange("name")}>
              <ArrowDownAZ />
              {t("friends.sortName")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading ? (
        <div aria-busy className="flex min-h-0 flex-1 flex-col overflow-hidden px-0.5">
          {[3, 4].map((count, group) => (
            <div key={group} className="flex shrink-0 flex-col">
              <div className="flex h-6 shrink-0 items-center gap-1.5 px-2">
                <Skeleton className="h-2 w-16 rounded" />
                <Skeleton className="h-2 w-3 rounded" />
              </div>
              {Array.from({ length: count }).map((_, index) => (
                <div
                  key={index}
                  className="flex h-12 shrink-0 items-center gap-2 px-2"
                >
                  <Skeleton className="size-8 shrink-0 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3 w-24 rounded" />
                    <Skeleton className="h-2.5 w-32 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-sm font-medium">{t("friends.nothingFound")}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("friends.nothingFoundHint")}
          </p>
        </div>
      ) : (
        <div
          ref={setScrollElement}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-0.5"
          onPointerEnter={freeze}
          onPointerLeave={thaw}
        >
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((item) => {
              const row = rows[item.index];
              if (!row) return null;

              return (
                <div
                  key={row.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {row.type === "section" ? (
                    <p className="flex h-6 items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-faint uppercase">
                      {t(SECTION_LABEL[row.kind])}
                      <span className="font-mono tabular-nums">{row.count}</span>
                    </p>
                  ) : (
                    <FriendRow
                      entry={row.entry}
                      isActive={row.key === activeFriendId}
                      isGameRunning={isGameRunning}
                      isCallBusy={isCallBusy}
                      ownUserId={ownUserId}
                      voiceRoomId={voiceRoomId}
                      t={t}
                      {...actions}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
