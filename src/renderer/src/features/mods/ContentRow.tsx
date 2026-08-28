import { memo } from "react";
import { useTranslation } from "react-i18next";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import {
  Ban,
  CircleArrowUp,
  CloudOff,
  Download,
  FileBox,
  Heart,
  Monitor,
  MonitorCog,
  PackageCheck,
  Plus,
  Power,
  PowerOff,
  Server,
  Trash2,
  Undo2,
} from "lucide-react";
import { Provider } from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Hint } from "@renderer/components/Hint";
import { formatBytes } from "@renderer/utilities/file";
import { ContentEntry } from "./entries";
import { formatCompactNumber } from "./format";
import { ProjectIcon } from "./ProjectIcon";

export const ROW_HEIGHT = 56;

export interface ContentRowActions {
  onOpen: (entry: ContentEntry) => void;
  onToggleSelected: (entry: ContentEntry) => void;
  onInstall: (entry: ContentEntry) => void;
  onUpdate: (entry: ContentEntry) => void;
  onDelete: (entry: ContentEntry) => void;
  onRestore: (entry: ContentEntry) => void;
  onToggleEnabled: (entry: ContentEntry, enabled: boolean) => void;
}

function ProviderMark({ provider }: { provider: Provider }) {
  if (provider === Provider.CURSEFORGE)
    return <SiCurseforge className="size-3 shrink-0" />;
  if (provider === Provider.MODRINTH)
    return <SiModrinth className="size-3 shrink-0" />;
  return <FileBox className="size-3 shrink-0" />;
}

function SideMark({ side }: { side: ContentEntry["side"] }) {
  if (side === "client") return <Monitor className="size-3 shrink-0" />;
  if (side === "server") return <Server className="size-3 shrink-0" />;
  return <MonitorCog className="size-3 shrink-0" />;
}

export const ContentRow = memo(function ContentRow({
  entry,
  lang,
  sizeUnits,
  isLibrary,
  isActive,
  isSelected,
  isDetailOpen,
  isSelectable,
  isEnabled,
  canEdit,
  canToggle,
  fileMissing,
  hasUpdate,
  isUnavailable,
  isUnchecked,
  isBusy,
  actions,
}: {
  entry: ContentEntry;
  lang: string;
  sizeUnits: string[];
  isLibrary: boolean;
  isActive: boolean;
  isSelected: boolean;
  isDetailOpen: boolean;
  isSelectable: boolean;
  isEnabled: boolean;
  canEdit: boolean;
  canToggle: boolean;
  fileMissing: boolean;
  hasUpdate: boolean;
  isUnavailable: boolean;
  isUnchecked: boolean;
  isBusy: boolean;
  actions: ContentRowActions;
}) {
  const { t } = useTranslation();

  const installed = entry.installed;
  const downloads = formatCompactNumber(entry.stats?.downloads, lang);
  const follows =
    entry.provider === Provider.MODRINTH
      ? formatCompactNumber(entry.stats?.follows, lang)
      : null;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={-1}
      data-active={isActive || undefined}
      data-open={isDetailOpen || undefined}
      onClick={() => actions.onOpen(entry)}
      className="group flex h-14 min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-surface-2 data-[active]:bg-surface-2 data-[open]:bg-surface-3"
    >
      {isSelectable ? (
        <div
          className="flex size-5 shrink-0 items-center justify-center"
          onClick={(event) => {
            event.stopPropagation();
            actions.onToggleSelected(entry);
          }}
        >
          <Checkbox
            checked={isSelected}
            aria-label={entry.title}
            className={
              isSelected
                ? ""
                : "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            }
          />
        </div>
      ) : null}

      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-1 text-faint">
        <ProjectIcon src={entry.iconUrl} size={36} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Hint content={entry.title} variant="text" truncatedOnly>
            <span
              className={`truncate text-sm leading-4 ${
                entry.pendingRemoved || !isEnabled
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              }`}
            >
              {entry.title}
            </span>
          </Hint>

          {hasUpdate && (
            <span className="shrink-0 rounded-sm bg-warning/15 px-1.5 py-0.5 text-[0.625rem] leading-3 font-medium text-warning">
              {t("modManager.availableUpdate")}
            </span>
          )}

          {isUnavailable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex size-4 shrink-0 items-center justify-center rounded-sm text-destructive">
                  <Ban className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("modManager.incompatible")}</TooltipContent>
            </Tooltip>
          )}

          {isUnchecked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex size-4 shrink-0 items-center justify-center rounded-sm text-faint">
                  <CloudOff className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("modManager.notChecked")}</TooltipContent>
            </Tooltip>
          )}

          {!isLibrary && installed && (
            <span className="flex shrink-0 items-center gap-1 rounded-sm bg-success/15 px-1.5 py-0.5 text-[0.625rem] leading-3 font-medium text-success">
              <PackageCheck className="size-2.5" />
              {t("modManager.installed")}
            </span>
          )}

          {entry.pendingRemoved && (
            <span className="shrink-0 rounded-sm bg-destructive/15 px-1.5 py-0.5 text-[0.625rem] leading-3 font-medium text-destructive">
              {t("modManager.deleted")}
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-2 text-xs leading-4 text-faint">
          <span className="flex shrink-0 items-center gap-1">
            <ProviderMark provider={entry.provider} />
          </span>

          {isLibrary ? (
            <>
              <span className="flex shrink-0 items-center gap-1">
                <SideMark side={entry.side} />
                {t(`modManager.sides.${entry.side}`)}
              </span>
              <Hint content={entry.fileName} variant="text" truncatedOnly>
                <span className="min-w-0 truncate">
                  {fileMissing && !entry.pendingRemoved
                    ? t("modManager.notDownloaded")
                    : entry.fileName || entry.description}
                </span>
              </Hint>
            </>
          ) : (
            <>
              {downloads && (
                <span className="flex shrink-0 items-center gap-1 tabular-nums">
                  <Download className="size-3 shrink-0" />
                  {downloads}
                </span>
              )}
              {follows && (
                <span className="flex shrink-0 items-center gap-1 tabular-nums">
                  <Heart className="size-3 shrink-0" />
                  {follows}
                </span>
              )}
              <Hint content={entry.description} variant="text" truncatedOnly>
                <span className="min-w-0 truncate">{entry.description}</span>
              </Hint>
            </>
          )}
        </div>
      </div>

      {isLibrary && entry.size > 0 && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
          {formatBytes(entry.size, sizeUnits, 1)}
        </span>
      )}

      <div
        className="flex shrink-0 items-center gap-1"
        onClick={(event) => event.stopPropagation()}
      >
        {entry.pendingRemoved ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="secondary"
                disabled={isBusy}
                aria-label={t("modManager.restore")}
                onClick={() => actions.onRestore(entry)}
              >
                <Undo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("modManager.restore")}</TooltipContent>
          </Tooltip>
        ) : isLibrary ? (
          <>
            {hasUpdate && canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-warning hover:bg-warning/15 hover:text-warning"
                    disabled={isBusy}
                    aria-label={t("common.update")}
                    onClick={() => actions.onUpdate(entry)}
                  >
                    <CircleArrowUp className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("common.update")}</TooltipContent>
              </Tooltip>
            )}

            {canToggle && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className={
                      isEnabled
                        ? "text-faint hover:text-foreground"
                        : "text-warning hover:bg-warning/15 hover:text-warning"
                    }
                    disabled={isBusy || fileMissing}
                    aria-label={t(
                      isEnabled ? "modManager.disable" : "modManager.enable",
                    )}
                    onClick={() => actions.onToggleEnabled(entry, !isEnabled)}
                  >
                    {isEnabled ? (
                      <Power className="size-4" />
                    ) : (
                      <PowerOff className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t(isEnabled ? "modManager.disable" : "modManager.enable")}
                </TooltipContent>
              </Tooltip>
            )}

            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-faint hover:bg-destructive/15 hover:text-destructive"
                    disabled={isBusy}
                    aria-label={t("common.delete")}
                    onClick={() => actions.onDelete(entry)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("common.delete")}</TooltipContent>
              </Tooltip>
            )}
          </>
        ) : canEdit && !installed ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5"
            disabled={isBusy}
            onClick={() => actions.onInstall(entry)}
          >
            <Plus className="size-3.5" />
            {t("modManager.install")}
          </Button>
        ) : null}
      </div>
    </div>
  );
});
