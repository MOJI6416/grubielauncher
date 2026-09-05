import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  EllipsisVertical,
  FolderArchive,
  FolderOpen,
  Gamepad2,
  ImageOff,
  Loader2,
  Pencil,
  Skull,
  Trash,
  X,
} from "lucide-react";
import { IWorld } from "@/types/World";
import { Version } from "@renderer/classes/Version";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { showFailureToast } from "@renderer/utilities/failures";
import { toast } from "sonner";
import { isWorldNameValid, nextAvailableName } from "./worldFacts";
import { DatapackOption } from "./useWorldsData";
import { WorldIcon } from "./WorldIcon";
import { WorldOverviewTab } from "./WorldOverviewTab";
import { WorldStatsTab } from "./WorldStatsTab";
import { WorldDatapacksTab } from "./WorldDatapacksTab";
import { WorldBackupsTab } from "./WorldBackupsTab";
import { WorldChunksTab } from "./WorldChunksTab";

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
  locale,
  onPlay,
  onRemoved,
  onRenamed,
  onRefresh,
  onDuplicated,
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
  locale: string;
  onPlay: () => void;
  onRemoved: () => void;
  onRenamed: (nextPath: string) => void;
  onRefresh: () => void;
  onDuplicated: (folderName: string) => void;
  onWorldPatched: (patch: Partial<IWorld>) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<WorldTab>("overview");
  const [editValue, setEditValue] = useState<string | null>(null);
  const [busy, setBusy] = useState<"rename" | "duplicate" | "export" | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

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

  const isLocked = !isOwner || world.isDownloaded || isVersionRunning;
  const canPlay = Boolean(version.isQuickPlaySingleplayer) && !isVersionRunning;
  const otherNames = takenNames.filter((name) => name !== world.name);

  const lockReason = isVersionRunning
    ? t("worlds.disabledWhileRunning")
    : world.isDownloaded
      ? t("worlds.downloadedHint")
      : !isOwner
        ? t("worlds.notOwnerHint")
        : undefined;

  const handleRename = async () => {
    if (editValue === null) return;

    const nextName = editValue.trim();
    setBusy("rename");

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
      toast.success(t("worlds.renamed"));
      onRenamed(result);
    } catch (error) {
      showFailureToast(t("worlds.renameError"), error, {
        fallbackDescription: t("worlds.renameErrorHint"),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDuplicate = async () => {
    setBusy("duplicate");

    try {
      const name = nextAvailableName(
        t("worlds.copyName", { name: world.name }),
        takenNames,
      );
      const result = await api.worlds.duplicate(world.path, name);

      if (!result?.ok) {
        showFailureToast(t("worlds.duplicateError"), undefined, {
          channels: ["worlds:duplicate"],
          fallbackDescription: t(
            `worlds.transferErrors.${result?.error ?? "failed"}`,
          ),
        });
        return;
      }

      toast.success(t("worlds.duplicated"));
      onDuplicated(api.path.basename(result.path));
    } catch (error) {
      showFailureToast(t("worlds.duplicateError"), error);
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    const picked = await api.other.openFileDialog(true);
    if (!picked?.length) return;

    setBusy("export");

    try {
      const result = await api.worlds.export(world.path, picked[0]);

      if (!result?.ok) {
        showFailureToast(t("worlds.exportError"), undefined, {
          channels: ["worlds:export"],
          fallbackDescription: t(
            `worlds.transferErrors.${result?.error ?? "failed"}`,
          ),
        });
        return;
      }

      toast.success(t("worlds.exported"), {
        description: api.path.basename(result.path),
        action: {
          label: t("worlds.openFolder"),
          onClick: () => void api.shell.openPath(picked[0]),
        },
      });
    } catch (error) {
      showFailureToast(t("worlds.exportError"), error);
    } finally {
      setBusy(null);
    }
  };

  const handleResetIcon = async () => {
    try {
      const removed = await api.fs.rimraf(
        api.path.join(world.path, "icon.png"),
      );

      if (!removed) {
        showFailureToast(t("worlds.iconResetError"), undefined, {
          channels: ["fs:rimraf"],
        });
        return;
      }

      onWorldPatched({ icon: undefined });
      toast.success(t("worlds.iconReseted"));
    } catch (error) {
      showFailureToast(t("worlds.iconResetError"), error, {
        channels: ["fs:"],
      });
    }
  };

  const handleDelete = async () => {
    try {
      if (!(await api.shell.trashItem(world.path))) {
        showFailureToast(t("worlds.deletedError"), undefined, {
          channels: ["shell:trashItem"],
          fallbackDescription: t("worlds.deletedErrorHint"),
        });
        return;
      }

      toast.success(t("worlds.deleted"));
      onRemoved();
    } catch (error) {
      showFailureToast(t("worlds.deletedError"), error, {
        fallbackDescription: t("worlds.deletedErrorHint"),
      });
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
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="size-8"
                  disabled={!canSaveName || busy === "rename"}
                  aria-label={t("common.save")}
                  onClick={() => void handleRename()}
                >
                  {busy === "rename" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  aria-label={t("common.cancel")}
                  onClick={() => setEditValue(null)}
                >
                  <X />
                </Button>
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
                    <span className="shrink-0 truncate font-mono text-[0.65rem] text-faint">
                      {world.folderName}
                    </span>
                  </Hint>
                )}
              </div>
            )}

            {nameError ? (
              <p className="truncate text-[0.65rem] text-warning">
                {nameError}
              </p>
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
            <Hint
              content={
                isVersionRunning
                  ? t("worlds.disabledWhileRunning")
                  : !version.isQuickPlaySingleplayer
                    ? t("worlds.quickPlayUnsupported")
                    : undefined
              }
            >
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                disabled={!canPlay}
                onClick={onPlay}
              >
                <Gamepad2 />
                {t("nav.play")}
              </Button>
            </Hint>

            <DropdownMenu>
              <Hint content={t("worlds.actions")}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-9"
                    aria-label={t("worlds.actions")}
                  >
                    {busy === "duplicate" || busy === "export" ? (
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
                <DropdownMenuItem
                  disabled={isLocked}
                  onSelect={() => {
                    keepFocusRef.current = true;
                    setEditValue(world.name);
                  }}
                >
                  <Pencil />
                  <span>{t("common.rename")}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  disabled={!isOwner || isVersionRunning || busy !== null}
                  onSelect={() => void handleDuplicate()}
                >
                  <Copy />
                  <span>{t("worlds.duplicate")}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  disabled={busy !== null || isVersionRunning}
                  onSelect={() => void handleExport()}
                >
                  <FolderArchive />
                  <span>{t("worlds.export")}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  disabled={!world.icon || isLocked}
                  onSelect={() => void handleResetIcon()}
                >
                  <ImageOff />
                  <span>{t("worlds.resetIcon")}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onSelect={() => void api.shell.openPath(world.path)}
                >
                  <FolderOpen />
                  <span>{t("worlds.openFolder")}</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  variant="destructive"
                  disabled={isLocked}
                  onSelect={() => setIsDeleting(true)}
                >
                  <Trash />
                  <span>{t("common.delete")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 border-b px-3">
          {TABS.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-selected={tab === entry}
              onClick={() => setTab(entry)}
              className="-mb-px border-b-2 border-transparent px-2 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground aria-selected:border-primary aria-selected:text-foreground"
            >
              {t(`worlds.tabs.${entry}`)}
              {entry === "datapacks" && world.datapacks.length > 0 && (
                <span className="ml-1 font-mono text-[0.65rem] text-faint">
                  {world.datapacks.length}
                </span>
              )}
              {entry === "backups" && backupCount > 0 && (
                <span className="ml-1 font-mono text-[0.65rem] text-faint">
                  {backupCount}
                </span>
              )}
            </button>
          ))}

          {lockReason && (
            <span className="ml-auto truncate py-2 text-[0.65rem] text-faint">
              {lockReason}
            </span>
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
            />
          )}
          {tab === "stats" && <WorldStatsTab world={world} locale={locale} />}
          {tab === "datapacks" && (
            <WorldDatapacksTab
              world={world}
              options={datapackOptions}
              disabled={isLocked}
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

      {isDeleting && (
        <Confirmation
          title={t("worlds.deleteTitle")}
          reversible
          content={[
            { text: t("worlds.confirmation", { name: world.name }) },
            ...(world.name === world.folderName
              ? []
              : [
                  {
                    text: t("worlds.confirmationFolder", {
                      folder: world.folderName,
                    }),
                    color: "default" as const,
                  },
                ]),
          ]}
          buttons={[
            {
              text: t("common.delete"),
              color: "danger",
              onClick: async () => {
                setIsDeleting(false);
                await handleDelete();
              },
            },
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setIsDeleting(false),
            },
          ]}
          onClose={() => setIsDeleting(false)}
        />
      )}
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
      className={`rounded px-1.5 py-0.5 text-[0.65rem] ${toneClass} ${
        mono ? "font-mono" : ""
      }`}
    >
      {children}
    </span>
  );
}
