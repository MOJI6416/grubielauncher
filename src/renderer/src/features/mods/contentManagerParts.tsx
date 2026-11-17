import { Database, Earth, Palette, Plug, Puzzle, SunMoon } from "lucide-react";
import {
  IProject,
  IVersion as ModVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { Hint } from "@renderer/components/Hint";
import { ContentEntry } from "./entries";

export const PROJECT_TYPE_ICONS: Partial<Record<ProjectType, typeof Puzzle>> = {
  [ProjectType.MOD]: Puzzle,
  [ProjectType.RESOURCEPACK]: Palette,
  [ProjectType.SHADER]: SunMoon,
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
    <Hint content={count != null && !active ? `${label} · ${count}` : label}>
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
          <span className="rounded-sm bg-surface-1 px-1 font-mono text-2xs leading-4 tabular-nums text-foreground">
            {count}
          </span>
        )}
      </button>
    </Hint>
  );
}
