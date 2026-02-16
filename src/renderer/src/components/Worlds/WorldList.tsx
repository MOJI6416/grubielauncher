import { IWorld } from "@/types/World";
import {
  addToast,
  Button,
  Card,
  CardBody,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Image,
  Input,
  ScrollShadow,
} from "@heroui/react";
import { RunGameParams } from "@renderer/App";
import { selectedVersionAtom } from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import {
  Clock,
  Copy,
  Edit,
  EllipsisVertical,
  Folder,
  Gamepad2,
  ImageOff,
  Package,
  Trash,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Datapacks } from "./Datapacks";
import { ILocalProject, ProjectType } from "@/types/ModManager";
import { formatTime } from "@renderer/utilities/date";
import { useTranslation } from "react-i18next";
import { Confirmation } from "../Modals/Confirmation";

const api = window.api;

export function WorldList({
  worlds,
  setWorlds,
  isOwner,
  runGame,
  closeModal,
}: {
  worlds: IWorld[];
  setWorlds: (worlds: IWorld[]) => void;
  isOwner: boolean;
  runGame: (params: RunGameParams) => Promise<void>;
  closeModal: () => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [version] = useAtom(selectedVersionAtom);
  const [editValue, setEditValue] = useState<string>("");
  const [isDatapacksOpen, setIsDatapacksOpen] = useState(false);
  const [selectedWorld, setSelectedWorld] = useState<IWorld | null>(null);
  const [datapacks, setDatapacks] = useState<
    { mod: ILocalProject; path: string; filename: string }[]
  >([]);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);

  const { t } = useTranslation();

  const isMountedRef = useRef(true);
  useEffect(() => {
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

        const mods = version.version.loader.mods.filter(
          (m) => m.projectType === ProjectType.DATAPACK,
        );
        const folderPath = await api.path.join(
          version.versionPath,
          await api.modManager.ptToFolder(ProjectType.DATAPACK),
        );

        const list: { mod: ILocalProject; path: string; filename: string }[] =
          [];

        for (const mod of mods) {
          const filename = mod.version?.files?.[0]?.filename;
          if (!filename) continue;

          const modPath = await api.path.join(folderPath, filename);
          if (!(await api.fs.pathExists(modPath))) continue;

          list.push({
            mod,
            path: modPath,
            filename: await api.path.basename(modPath),
          });
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
  }, [version]);

  const canPlay = !!version?.isQuickPlayMultiplayer;

  const handleDelete = useCallback(async () => {
    if (!selectedWorld) return;

    try {
      await api.fs.rimraf(selectedWorld.path);
      setWorlds(worlds.filter((w) => w.path !== selectedWorld.path));

      addToast({
        title: t("worlds.deleted"),
        color: "success",
      });
    } catch {
      addToast({
        title: t("worlds.deleteError"),
        color: "danger",
      });
    }
  }, []);

  return (
    <>
      <ScrollShadow className="h-80 w-full min-w-0">
        <div className="flex flex-col gap-2 pr-1 min-w-0">
          {worlds.map((world, index) => {
            const isEditing = editingIndex === index;

            const disabledKeys = useMemo(() => {
              const keys = new Set<string>();
              if (!canPlay) keys.add("play");
              if (!isOwner) {
                keys.add("datapacks");
                keys.add("rename");
                keys.add("resetIcon");
                keys.add("openFolder");
                keys.add("delete");
              }
              if (world.isDownloaded) {
                keys.add("rename");
                keys.add("delete");
              }
              if (!world.icon) keys.add("resetIcon");
              return keys;
            }, [canPlay, isOwner, world.isDownloaded, world.icon]);

            return (
              <Card
                key={world.path || world.folderName || world.name}
                className="border-white/20 border-1"
              >
                <CardBody>
                  <div className="flex items-center gap-3 justify-between min-w-0">
                    <div className="flex items-center space-x-2 min-w-0">
                      {world.icon && (
                        <Image
                          src={world.icon}
                          alt={`${world.name} icon`}
                          width={40}
                          height={40}
                          className="min-h-10 min-w-10 shrink-0"
                        />
                      )}

                      {isEditing ? (
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          size="sm"
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setEditingIndex(null);
                              setEditValue("");
                            }
                          }}
                        />
                      ) : (
                        <div className="flex flex-col min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {world.name}
                          </p>
                          {world.name !== world.folderName && (
                            <p className="text-xs text-gray-400 truncate">
                              {world.folderName}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      {world.statistics && !isEditing && (
                        <div className="flex items-center gap-1">
                          <Clock className="text-gray-400 shrink-0" size={18} />
                          <p className="text-xs text-gray-400">
                            {formatTime(
                              (world.statistics.stats["minecraft:custom"][
                                "minecraft:play_time"
                              ] *
                                50) /
                                1000,
                              {
                                h: t("time.h"),
                                m: t("time.m"),
                                s: t("time.s"),
                              },
                            )}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        {isEditing && (
                          <>
                            <Button
                              variant="flat"
                              size="sm"
                              color="success"
                              isIconOnly
                              isDisabled={
                                editValue.trim() === "" ||
                                editValue.trim() === world.name ||
                                worlds.some(
                                  (w, i) =>
                                    i !== index && w.name === editValue.trim(),
                                ) ||
                                editValue.trim().length > 64
                              }
                              onPress={async () => {
                                try {
                                  const nextName = editValue.trim();
                                  const result = await api.worlds.writeName(
                                    world.path,
                                    nextName,
                                  );

                                  if (!result) {
                                    addToast({
                                      title: t("worlds.renameError"),
                                      color: "danger",
                                    });
                                    return;
                                  }

                                  const newFolderName =
                                    await api.path.basename(result);
                                  const newIcon = world.icon
                                    ? `${result}/icon.png`
                                    : undefined;

                                  setWorlds(
                                    worlds.map((w) =>
                                      w.path === world.path
                                        ? {
                                            ...w,
                                            name: nextName,
                                            path: result,
                                            folderName: newFolderName,
                                            icon: newIcon,
                                          }
                                        : w,
                                    ),
                                  );

                                  setEditingIndex(null);
                                  setEditValue("");
                                  addToast({
                                    title: t("worlds.renamed"),
                                    color: "success",
                                  });
                                } catch (err) {
                                  console.error(err);
                                  addToast({
                                    title: t("worlds.renameError"),
                                    color: "danger",
                                  });
                                }
                              }}
                            >
                              <Edit size={20} />
                            </Button>

                            <Button
                              variant="flat"
                              color="danger"
                              size="sm"
                              isIconOnly
                              onPress={() => {
                                setEditingIndex(null);
                                setEditValue("");
                              }}
                            >
                              <X size={20} />
                            </Button>
                          </>
                        )}

                        <Dropdown
                          isTriggerDisabled={editingIndex !== null}
                          size="sm"
                        >
                          <DropdownTrigger>
                            <Button isIconOnly variant="flat" size="sm">
                              <EllipsisVertical size={22} />
                            </Button>
                          </DropdownTrigger>
                          <DropdownMenu disabledKeys={[...disabledKeys]}>
                            <DropdownItem
                              key="play"
                              color="secondary"
                              className="text-secondary"
                              startContent={
                                <Gamepad2 className="shrink-0" size={20} />
                              }
                              onPress={() => {
                                runGame({
                                  version,
                                  quick: {
                                    single: world.folderName,
                                  },
                                });
                                closeModal();
                              }}
                            >
                              {t("nav.play")}
                            </DropdownItem>
                            <DropdownItem
                              key="datapacks"
                              variant="flat"
                              className="text-primary-500"
                              color="primary"
                              startContent={<Package size={20} />}
                              onPress={() => {
                                setSelectedWorld(world);
                                setIsDatapacksOpen(true);
                              }}
                            >
                              {t("worlds.datapacks")}
                            </DropdownItem>
                            <DropdownItem
                              key="rename"
                              variant="flat"
                              startContent={<Edit size={20} />}
                              onPress={() => {
                                setEditingIndex(index);
                                setEditValue(world.name);
                              }}
                            >
                              {t("common.rename")}
                            </DropdownItem>
                            <DropdownItem
                              key="copySeed"
                              variant="flat"
                              startContent={<Copy size={20} />}
                              onPress={async () => {
                                await api.clipboard.writeText(world.seed);
                                addToast({ title: t("common.copied") });
                              }}
                            >
                              {t("worlds.copySeed")}
                            </DropdownItem>
                            <DropdownItem
                              key="resetIcon"
                              variant="flat"
                              startContent={<ImageOff size={20} />}
                              onPress={async () => {
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
                                  addToast({
                                    title: t("worlds.iconReseted"),
                                    color: "success",
                                  });
                                } catch (err) {
                                  console.error(err);
                                  addToast({
                                    title: t("common.error") || "Error",
                                    color: "danger",
                                  });
                                }
                              }}
                            >
                              {t("worlds.resetIcon")}
                            </DropdownItem>
                            <DropdownItem
                              key="openFolder"
                              variant="flat"
                              startContent={<Folder size={20} />}
                              onPress={async () =>
                                await api.shell.openPath(world.path)
                              }
                            >
                              {t("worlds.openFolder")}
                            </DropdownItem>
                            <DropdownItem
                              key="delete"
                              className="text-danger"
                              variant="flat"
                              color="danger"
                              startContent={<Trash size={20} />}
                              onPress={() => {
                                setSelectedWorld(world);
                                setIsConfirmationOpen(true);
                              }}
                            >
                              {t("common.delete")}
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </ScrollShadow>

      {isDatapacksOpen && version && selectedWorld && (
        <Datapacks
          datapacks={datapacks}
          onClose={() => setIsDatapacksOpen(false)}
          world={selectedWorld}
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
