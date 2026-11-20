import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  EllipsisVertical,
  Loader2,
  Play,
  Skull,
  X,
} from "lucide-react";
import { IWorld } from "@/types/World";
import { ILocalProject } from "@/types/ModManager";
import { Version } from "@renderer/classes/Version";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { showFailureToast } from "@renderer/utilities/failures";
import { isWorldNameValid } from "./worldFacts";
import { DatapackOption } from "./useWorldsData";
import { WorldIcon } from "./WorldIcon";
import { WorldOverviewTab } from "./WorldOverviewTab";
import { WorldStatsTab } from "./WorldStatsTab";
import { WorldDatapacksTab } from "./WorldDatapacksTab";
import { WorldBackupsTab } from "./WorldBackupsTab";
import { WorldChunksTab } from "./WorldChunksTab";
import { SlidingIndicator } from "@renderer/components/SlidingIndicator";
import { useSlidingIndicator } from "@renderer/utilities/useSlidingIndicator";
import { WorldActions, WorldMenuItems } from "./worldActions";
import { useWorldAdvancements } from "./WorldAdvancements";

const api = window.api;

const TABS = [
  "overview",
  "stats",
  "datapacks",
  "chunks",
  "backups",
] as const;

type WorldTab = (typeof TABS)[number];

export function WorldDetail({
  world,
  version,
  isOwner,
  isVersionRunning,
  sizeBytes,
  backupCount,
  takenNames,
  datapackOptions,
  mods,
  locale,
  actions,
  renameRequested,
  onRenameHandled,
  onPlay,
  onRenamed,
  onRefresh,
  onWorldPatched,
}: {
  world: IWorld;
  version: Version;
  isOwner: boolean;
  isVersionRunning: boolean;
  sizeBytes: number | null;
  backupCount: number;
  takenNames: string[];
  datapackOptions: DatapackOption[];
  mods: ILocalProject[] | undefined;
  locale: string;
  actions: WorldActions;
  renameRequested: boolean;
  onRenameHandled: () => void;
  onPlay: () => void;
  onRenamed: (nextPath: string) => void;
  onRefresh: () => void;
  onWorldPatched: (patch: Partial<IWorld>) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<WorldTab>("overview");
  const tabIndicator = useSlidingIndicator<HTMLDivElement>();
  const [editValue, setEditValue] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const keepFocusRef = useRef(false);
  const isEditing = editValue !== null;

  useEffect(() => {
    if (!isEditing) return;

    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isEditing]);

  useEffect(() => {
    if (!renameRequested) return;
    onRenameHandled();
    if (!actions.isLocked(world)) setEditValue(world.name);
  }, [actions, onRenameHandled, renameRequested, world]);

  const isLocked = actions.isLocked(world);
  const advancements = useWorldAdvancements(
    world,
    version.version.version.id,
  );
  const canPlay = Boolean(version.isQuickPlaySingleplayer) && !isVersionRunning;
  const otherNames = takenNames.filter((name) => name !== world.name);

  const lockReason = isVersionRunning
    ? t("worlds.disabledWhileRunning")
    : world.isDownloaded
      ? t("worlds.downloadedHint")
      : !isOwner
        ? t("worlds.notOwnerHint")
        : undefined;

  const playReason =
    !isVersionRunning && !version.isQuickPlaySingleplayer
      ? t("worlds.quickPlayUnsupported")
      : undefined;
  const statusLine = [lockReason, playReason].filter(Boolean).join(" · ");

  const handleRename = async () => {
    if (editValue === null) return;

    const nextName = editValue.trim();
    setIsRenaming(true);

    try {
      const result = await api.worlds.writeName(world.path, nextName);

      if (!result) {
        showFailureToast(t("worlds.renameError"), undefined, {
          channels: ["worlds:writeName", "fs:"],
          fallbackDescription: t("worlds.renameErrorHint"),
        });
        return;
      }

      setEditValue(null);
      onRenamed(result);
    } catch (error) {
      showFailureToast(t("worlds.renameError"), error, {
        fallbackDescription: t("worlds.renameErrorHint"),
      });
    } finally {
      setIsRenaming(false);
    }
  };

  const trimmedName = (editValue ?? "").trim();
  const canSaveName = isEditing && isWorldNameValid(trimmedName, otherNames);
  const nameError = !isEditing
    ? undefined
    : !trimmedName
      ? t("worlds.nameEmpty")
      : otherNames.includes(trimmedName)
        ? t("worlds.nameTaken")
        : undefined;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.indexOf(tab);
    const target =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : event.key === "ArrowLeft"
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? TABS.length - 1
              : null;
    if (target === null) return;

    event.preventDefault();
    setTab(TABS[target]);
    tabIndicator.containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')?.item(target)?.focus();
  };

  return (
    <>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
        <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5">
          <WorldIcon
            icon={world.icon}
            size={48}
            className="size-12 rounded-lg"
            iconClassName="size-5"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {isEditing ? (
              <div className="flex items-center gap-1.5">
                <Input
                  ref={nameInputRef}
                  value={editValue ?? ""}
                  className="h-8 min-w-0 flex-1"
                  maxLength={64}
                  onChange={(event) => setEditValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setEditValue(null);
                    if (event.key === "Enter" && canSaveName) {
                      void handleRename();
                    }
                  }}
                />
                <Hint
                  content={
                    !canSaveName || isRenaming ? undefined : t("common.save")
                  }
                >
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-8"
                    disabled={!canSaveName || isRenaming}
                    aria-label={t("common.save")}
                    onClick={() => void handleRename()}
                  >
                    {isRenaming ? <Loader2 className="animate-spin" /> : <Check />}
                  </Button>
                </Hint>
                <Hint content={t("common.cancel")}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-8"
                    aria-label={t("common.cancel")}
                    onClick={() => setEditValue(null)}
                  >
                    <X />
                  </Button>
                </Hint>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-1.5">
                {world.hardcore && (
                  <Skull className="size-3.5 shrink-0 text-destructive" />
                )}
                <Hint content={world.name} variant="text" truncatedOnly>
                  <p className="truncate text-sm font-semibold">{world.name}</p>
                </Hint>
                {world.name !== world.folderName && (
                  <Hint content={world.folderName} variant="text" truncatedOnly>
                    <span className="shrink-0 truncate font-mono text-3xs text-faint">
                      {world.folderName}
                    </span>
                  </Hint>
                )}
              </div>
            )}

            {nameError ? (
              <Hint content={nameError} variant="text" truncatedOnly>
                <p className="truncate text-3xs text-warning">{nameError}</p>
              </Hint>
            ) : (
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {world.hardcore ? (
                  <Chip tone="destructive">{t("worlds.hardcore")}</Chip>
                ) : (
                  world.gameMode && (
                    <Chip>{t(`worlds.gameModes.${world.gameMode}`)}</Chip>
                  )
                )}
                {world.difficulty && (
                  <Chip>{t(`worlds.difficulties.${world.difficulty}`)}</Chip>
                )}
                {world.cheats && (
                  <Chip tone="warning">{t("worlds.cheats")}</Chip>
                )}
                {world.versionName && <Chip mono>{world.versionName}</Chip>}
                {world.isDownloaded && <Chip>{t("worlds.fromCatalog")}</Chip>}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              disabled={!canPlay}
              onClick={onPlay}
            >
              <Play />
              {t("nav.play")}
            </Button>

            <DropdownMenu>
              <Hint content={t("worlds.actions")}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-9"
                    aria-label={t("worlds.actions")}
                  >
                    {actions.busy !== null ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <EllipsisVertical />
                    )}
                  </Button>
                </DropdownMenuTrigger>
              </Hint>
              <DropdownMenuContent
                align="end"
                className="w-56"
                onCloseAutoFocus={(event) => {
                  if (!keepFocusRef.current) return;
                  keepFocusRef.current = false;
                  event.preventDefault();
                }}
              >
                <WorldMenuItems
                  menu="dropdown"
                  world={world}
                  version={version}
                  isOwner={isOwner}
                  isVersionRunning={isVersionRunning}
                  actions={actions}
                  onRename={() => {
                    keepFocusRef.current = true;
                    setEditValue(world.name);
                  }}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b px-3">
          <div
            ref={tabIndicator.containerRef}
            role="tablist"
            aria-label={t("worlds.title")}
            onKeyDown={handleTabKeyDown}
            className="relative flex shrink-0 items-center gap-1"
          >
            {TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={tab === entry}
                tabIndex={tab === entry ? 0 : -1}
                data-indicator-active={tab === entry}
                onClick={() => setTab(entry)}
                className="-mb-px border-b-2 border-transparent px-2 py-2 text-xs whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-selected:text-foreground"
              >
                {t(`worlds.tabs.${entry}`)}
                {entry === "datapacks" && world.datapacks.length > 0 && (
                  <span className="ml-1 font-mono text-3xs text-faint">
                    {world.datapacks.length}
                  </span>
                )}
                {entry === "backups" && backupCount > 0 && (
                  <span className="ml-1 font-mono text-3xs text-faint">
                    {backupCount}
                  </span>
                )}
              </button>
            ))}
            <SlidingIndicator indicator={tabIndicator} variant="underline" />
          </div>

          {statusLine && (
            <Hint content={statusLine} variant="text" truncatedOnly>
              <span className="ml-auto min-w-0 truncate py-2 text-3xs text-faint">
                {statusLine}
              </span>
            </Hint>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === "overview" && (
            <WorldOverviewTab
              world={world}
              version={version}
              sizeBytes={sizeBytes}
              backupCount={backupCount}
              locale={locale}
              advancements={advancements}
              onOpenStats={() => setTab("stats")}
            />
          )}
          {tab === "stats" && (
            <WorldStatsTab
              world={world}
              locale={locale}
              advancements={advancements}
              mods={mods}
            />
          )}
          {tab === "datapacks" && (
            <WorldDatapacksTab
              world={world}
              version={version}
              options={datapackOptions}
              disabled={isLocked}
              lockReason={lockReason}
              onChange={(datapacks) => onWorldPatched({ datapacks })}
            />
          )}
          {tab === "chunks" && (
            <WorldChunksTab
              world={world}
              locked={isLocked}
              lockReason={lockReason}
              locale={locale}
              onChanged={onRefresh}
            />
          )}
          {tab === "backups" && (
            <WorldBackupsTab
              world={world}
              isVersionRunning={isVersionRunning}
              onChanged={onRefresh}
            />
          )}
        </div>
      </div>

    </>
  );
}

function Chip({
  children,
  tone = "muted",
  mono,
}: {
  children: React.ReactNode;
  tone?: "muted" | "destructive" | "warning";
  mono?: boolean;
}) {
  const toneClass =
    tone === "destructive"
      ? "bg-destructive/15 text-destructive"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : "bg-surface-3 text-muted-foreground";

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-3xs ${toneClass} ${
        mono ? "font-mono" : ""
      }`}
    >
      {children}
    </span>
  );
}
