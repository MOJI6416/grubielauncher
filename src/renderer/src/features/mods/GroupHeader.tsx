import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  Ellipsis,
  FolderPen,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { ContentEntry } from "./entries";
import { UNGROUPED_ID } from "./modGroups";

export const GROUP_HEADER_HEIGHT = 36;

export interface GroupHeaderActions {
  onToggleCollapsed: (groupId: string) => void;
  onSetEnabled: (entries: ContentEntry[], enabled: boolean) => void;
  onRename: (groupId: string, name: string) => void;
  onDelete: (groupId: string, name: string) => void;
}

export function GroupHeader({
  groupId,
  name,
  count,
  collapsed,
  entries,
  allDisabled,
  canToggle,
  isBusy,
  actions,
}: {
  groupId: string;
  name: string;
  count: number;
  collapsed: boolean;
  entries: ContentEntry[];
  allDisabled: boolean;
  canToggle: boolean;
  isBusy: boolean;
  actions: GroupHeaderActions;
}) {
  const { t } = useTranslation();
  const isUngrouped = groupId === UNGROUPED_ID;
  const title = isUngrouped ? t("modGroups.ungrouped") : name;
  const toggleLabel = t(allDisabled ? "modGroups.enableAll" : "modGroups.disableAll");

  return (
    <div className="flex h-9 min-w-0 items-center gap-1 border-b border-border/60 px-1">
      <button
        type="button"
        disabled={isUngrouped}
        aria-expanded={isUngrouped ? undefined : !collapsed}
        aria-label={
          isUngrouped
            ? undefined
            : t(collapsed ? "modGroups.expand" : "modGroups.collapse")
        }
        onClick={() => actions.onToggleCollapsed(groupId)}
        className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left transition-colors enabled:hover:bg-surface-2"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-faint transition-transform",
            !collapsed && "rotate-90",
            isUngrouped && "invisible",
          )}
        />
        <span
          className={cn(
            "min-w-0 truncate text-[0.7rem] font-semibold tracking-[0.06em] uppercase",
            allDisabled ? "text-faint line-through" : "text-muted-foreground",
          )}
        >
          {title}
        </span>
        <span className="shrink-0 font-mono text-[0.65rem] text-faint tabular-nums">
          {count}
        </span>
      </button>

      {canToggle && (
        <Hint content={toggleLabel}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={toggleLabel}
            disabled={isBusy}
            className={
              allDisabled
                ? "text-warning hover:bg-warning/15 hover:text-warning"
                : "text-faint hover:text-foreground"
            }
            onClick={() => actions.onSetEnabled(entries, allDisabled)}
          >
            {allDisabled ? (
              <PowerOff className="size-4" />
            ) : (
              <Power className="size-4" />
            )}
          </Button>
        </Hint>
      )}

      {!isUngrouped && (
        <DropdownMenu>
          <Hint content={t("modGroups.menu")}>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-faint hover:text-foreground"
                aria-label={t("modGroups.menu")}
              >
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => actions.onRename(groupId, name)}>
              <FolderPen />
              {t("modGroups.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => actions.onDelete(groupId, name)}
            >
              <Trash2 />
              {t("modGroups.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
