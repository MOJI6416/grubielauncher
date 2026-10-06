import { Database, Earth, Palette, Plug, Puzzle, Sparkles } from "lucide-react";
import {
  IProject,
  IVersion as ModVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ContentEntry } from "./entries";

export const PROJECT_TYPE_ICONS: Partial<Record<ProjectType, typeof Puzzle>> = {
  [ProjectType.MOD]: Puzzle,
  [ProjectType.RESOURCEPACK]: Palette,
  [ProjectType.SHADER]: Sparkles,
  [ProjectType.DATAPACK]: Database,
  [ProjectType.WORLD]: Earth,
  [ProjectType.PLUGIN]: Plug,
};

export type Scope = "library" | Provider.CURSEFORGE | Provider.MODRINTH;

export interface DetailState {
  entry: ContentEntry;
  project: IProject | null;
  versions: ModVersion[];
  selectedVersionId: string | null;
  isLoading: boolean;
  error: boolean;
  depsError: boolean;
}

export function ScopeButton({
  active,
  label,
  count,
  compact = false,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  count?: number;
  compact?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={active}
          aria-label={label}
          data-indicator-active={active}
          onClick={onClick}
          className="relative flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {children}
          {active && (
            <span
              className={
                compact
                  ? "hidden whitespace-nowrap @5xl:inline"
                  : "whitespace-nowrap"
              }
            >
              {label}
            </span>
          )}
          {active && count != null && (
            <span className="rounded-sm bg-surface-1 px-1 font-mono text-[0.6875rem] leading-4 tabular-nums text-foreground">
              {count}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {count != null && !active ? `${label} · ${count}` : label}
      </TooltipContent>
    </Tooltip>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center px-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-surface-3">
        {icon}
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-80 text-xs leading-5 text-balance text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
