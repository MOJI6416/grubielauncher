import { IWorld } from "@/types/World";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RunGameParams } from "@renderer/App";
import { accountAtom, selectedVersionAtom } from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import {
  BarChart3,
  Clock,
  Copy,
  Edit,
  EllipsisVertical,
  Folder,
  FolderOpen,
  Gamepad2,
  ImageOff,
  Package,
  Skull,
  Swords,
  Trash,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Datapacks } from "./Datapacks";
import { WorldStats } from "./WorldStats";
import { worldDisplayStats } from "@renderer/utilities/worldStats";
import { ILocalProject, ProjectType } from "@/types/ModManager";
import { formatTime } from "@renderer/utilities/date";
import { useTranslation } from "react-i18next";
import { Confirmation } from "../Modals/Confirmation";
import { toast } from "sonner";
import { resolveLocalImage } from "@renderer/utilities/localMedia";

const api = window.api;

export function WorldList({
  worlds,
  setWorlds,
  isOwner,
  runGame,
  closeModal,
  mods: availableMods,
}: {
  worlds: IWorld[];
  setWorlds: (worlds: IWorld[]) => void;
  isOwner: boolean;
  runGame: (params: RunGameParams) => Promise<void>;
  closeModal: () => void;
  mods?: ILocalProject[];
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [version] = useAtom(selectedVersionAtom);
  const [account] = useAtom(accountAtom);
  const [editValue, setEditValue] = useState<string>("");
  const [isDatapacksOpen, setIsDatapacksOpen] = useState(false);
  const [selectedWorld, setSelectedWorld] = useState<IWorld | null>(null);
  const [datapacks, setDatapacks] = useState<
    {
      mod: ILocalProject;
      file: NonNullable<ILocalProject["version"]>["files"][number];
      path: string;
      filename: string;
      isDownloaded: boolean;
    }[]
  >([]);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [statsWorld, setStatsWorld] = useState<IWorld | null>(null);

  const { t, i18n } = useTranslation();
  const nf = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!version) {
          if (!cancelled && isMountedRef.current) setDatapacks([]);
          return;
        }

        const mods = (
          availableMods ??
          version.version.loader.mods ??
          []
        ).filter((m) => m.projectType === ProjectType.DATAPACK);
        const folderPath = await api.path.join(
          version.versionPath,
          await api.modManager.ptToFolder(ProjectType.DATAPACK),
        );

        const list: {
          mod: ILocalProject;
          file: NonNullable<ILocalProject["version"]>["files"][number];
          path: string;
          filename: string;
          isDownloaded: boolean;
        }[] = [];

        const addedFilenames = new Set<string>();

        for (const mod of mods) {
          for (const file of mod.version?.files ?? []) {
            const filename = file.filename;
            if (!filename) continue;
            if (addedFilenames.has(filename)) continue;

            const storagePath = await api.path.join(folderPath, filename);
            const storageExists = await api.fs.pathExists(storagePath);
            const localPath =
              file.localPath && (await api.fs.pathExists(file.localPath))
                ? file.localPath
                : undefined;
            const datapackPath = storageExists
              ? storagePath
              : localPath || storagePath;

            addedFilenames.add(filename);
            list.push({
              mod,
              file,
              path: datapackPath,
              filename,
              isDownloaded: storageExists || Boolean(localPath),
            });
          }
        }

        if (!cancelled && isMountedRef.current) setDatapacks(list);
      } catch (err) {
        console.error(err);
        if (!cancelled && isMountedRef.current) setDatapacks([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [version, availableMods]);

  const canPlay = !!version?.isQuickPlaySingleplayer;

  const handleDelete = useCallback(async () => {
    if (!selectedWorld) return;

    try {
      await api.shell.trashItem(selectedWorld.path);
      setWorlds(worlds.filter((w) => w.path !== selectedWorld.path));

      toast.success(t("worlds.deleted"));
    } catch {
      toast.error(t("worlds.deletedError"));
    }
  }, [selectedWorld, setWorlds, t, worlds]);

  return (
    <>
      <ScrollArea className="h-[26rem] w-full min-w-0">
        <div className="flex min-w-0 flex-col gap-2 pr-3">
          {worlds.map((world, index) => {
            const isEditing = editingIndex === index;
            const ws = worldDisplayStats(world.statistics);

            const disabledKeys = new Set<string>();
            if (!canPlay) disabledKeys.add("play");
            if (!isOwner) {
              disabledKeys.add("rename");
              disabledKeys.add("resetIcon");
              disabledKeys.add("openFolder");
              disabledKeys.add("delete");
              disabledKeys.add("datapacks");
            }
            if (world.isDownloaded) {
              disabledKeys.add("rename");
              disabledKeys.add("delete");
            }
            if (!world.icon) disabledKeys.add("resetIcon");
            if (!world.seed) disabledKeys.add("copySeed");

            return (
              <Card
                key={world.path || world.folderName || world.name}
                className="gap-0 overflow-hidden py-0 shadow-none transition-colors hover:bg-accent/25"
              >
                <CardContent className="p-3">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 text-muted-foreground">
                        {world.icon ? (
                          <img
                            src={resolveLocalImage(world.icon)}
                            alt={`${world.name} icon`}
                            width={44}
                            height={44}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <FolderOpen className="size-5" />
                        )}
                      </div>

                      {isEditing ? (
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="h-9 min-w-0"
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setEditingIndex(null);
                              setEditValue("");
                            }
                          }}
                        />
                      ) : (
                        <div className="grid min-w-0 gap-1">
                          <p
                            className="truncate text-sm font-semibold text-foreground"
                            title={world.name}
                          >
                            {world.name}
                          </p>
                          {world.name !== world.folderName && (
                            <p
                              className="truncate text-xs text-muted-foreground"
                              title={world.folderName}
                            >
                              {world.folderName}
                            </p>
                          )}
                          {ws.hasData && (
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="size-3 shrink-0" />
                                {formatTime(Math.floor(ws.playTimeTicks / 20), {
                                  h: t("time.h"),
                                  m: t("time.m"),
                                  s: t("time.s"),
                                })}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Skull className="size-3 shrink-0" />
                                {nf(ws.deaths)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Swords className="size-3 shrink-0" />
                                {nf(ws.mobKills)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        {isEditing && (
                          <>
                            <Button
                              size="icon-sm"
                              disabled={
                                editValue.trim() === "" ||
                                editValue.trim() === world.name ||
                                worlds.some(
                                  (w, i) =>
                                    i !== index && w.name === editValue.trim(),
                                ) ||
                                editValue.trim().length > 64
                              }
                              onClick={async () => {
                                try {
                                  const nextName = editValue.trim();
                                  const result = await api.worlds.writeName(
                                    world.path,
                                    nextName,
                                  );

                                  if (!result) {
                                    toast.error(t("worlds.renameError"));
                                    return;
                                  }

                                  const newFolderName =
                                    await api.path.basename(result);
                                  const updatedWorld = account
                                    ? await api.worlds.readWorld(
                                        result,
                                        account,
                                      )
                                    : null;

                                  setWorlds(
                                    worlds.map((w) =>
                                      w.path === world.path
                                        ? updatedWorld || {
                                            ...w,
                                            name: nextName,
                                            path: result,
                                            folderName: newFolderName,
                                          }
                                        : w,
                                    ),
                                  );

                                  setEditingIndex(null);
                                  setEditValue("");
                                  toast.success(t("worlds.renamed"));
                                } catch (err) {
                                  console.error(err);
                                  toast.error(t("worlds.renameError"));
                                }
                              }}
                            >
                              <Edit size={20} />
                            </Button>

                            <Button
                              variant="destructive"
                              size="icon-sm"
                              onClick={() => {
                                setEditingIndex(null);
                                setEditValue("");
                              }}
                            >
                              <X size={20} />
                            </Button>
                          </>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className="size-8 bg-background/40 hover:bg-accent"
                              disabled={editingIndex !== null}
                            >
                              <EllipsisVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!ws.hasData}
                              onSelect={() => setStatsWorld(world)}
                            >
                              <BarChart3 />
                              <span>{t("worldStats.title")}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={disabledKeys.has("play")}
                              onSelect={() => {
                                runGame({
                                  version,
                                  quick: {
                                    single: world.folderName,
                                  },
                                });
                                closeModal();
                              }}
                            >
                              <Gamepad2 />
                              <span>{t("nav.play")}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={disabledKeys.has("datapacks")}
                              onSelect={() => {
                                setSelectedWorld(world);
                                setIsDatapacksOpen(true);
                              }}
                            >
                              <Package />
                              <span>{t("worlds.datapacks")}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={disabledKeys.has("rename")}
                              onSelect={() => {
                                setEditingIndex(index);
                                setEditValue(world.name);
                              }}
                            >
                              <Edit />
                              <span>{t("common.rename")}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={disabledKeys.has("copySeed")}
                              onSelect={async () => {
                                await api.clipboard.writeText(world.seed);
                                toast(t("common.copied"));
                              }}
                            >
                              <Copy />
                              <span>{t("worlds.copySeed")}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={disabledKeys.has("resetIcon")}
                              onSelect={async () => {
                                try {
                                  await api.fs.rimraf(
                                    await api.path.join(world.path, "icon.png"),
                                  );
                                  setWorlds(
                                    worlds.map((w) =>
                                      w.path === world.path
                                        ? { ...w, icon: undefined }
                                        : w,
                                    ),
                                  );
                                  toast.success(t("worlds.iconReseted"));
                                } catch (err) {
                                  console.error(err);
                                  toast.error(t("worlds.iconResetError"));
                                }
                              }}
                            >
                              <ImageOff />
                              <span>{t("worlds.resetIcon")}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={disabledKeys.has("openFolder")}
                              onSelect={async () =>
                                await api.shell.openPath(world.path)
                              }
                            >
                              <Folder />
                              <span>{t("worlds.openFolder")}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={disabledKeys.has("delete")}
                              onSelect={() => {
                                setSelectedWorld(world);
                                setIsConfirmationOpen(true);
                              }}
                            >
                              <Trash />
                              <span>{t("common.delete")}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {statsWorld && (
        <WorldStats world={statsWorld} onClose={() => setStatsWorld(null)} />
      )}

      {isDatapacksOpen && version && selectedWorld && (
        <Datapacks
          datapacks={datapacks}
          onClose={() => setIsDatapacksOpen(false)}
          world={selectedWorld}
          onChange={(next) =>
            setWorlds(
              worlds.map((w) =>
                w.path === selectedWorld.path ? { ...w, datapacks: next } : w,
              ),
            )
          }
        />
      )}

      {isConfirmationOpen && selectedWorld && (
        <Confirmation
          content={[
            {
              text: t("worlds.confirmation"),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              onClick: async () => {
                await handleDelete();
                setIsConfirmationOpen(false);
              },
            },
            {
              text: t("common.no"),
              color: "default",
              onClick: () => setIsConfirmationOpen(false),
            },
          ]}
          onClose={() => setIsConfirmationOpen(false)}
        />
      )}
    </>
  );
}
