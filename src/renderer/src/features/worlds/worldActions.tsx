import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Copy,
  FolderArchive,
  FolderOpen,
  ImageOff,
  Map as MapIcon,
  MonitorDown,
  Pencil,
  Trash,
} from "lucide-react";
import { toast } from "sonner";
import { IWorld } from "@/types/World";
import { Version } from "@renderer/classes/Version";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { createDesktopShortcut } from "@renderer/features/instances/instanceActions";
import { showFailureToast } from "@renderer/utilities/failures";
import { nextAvailableName } from "./worldFacts";
import { removeWithUndo } from "@renderer/utilities/removeWithUndo";
import { countFeature } from "@renderer/features/usage/usage";
import { seedMapUrl } from "./seedMap";

const api = window.api;

export type WorldBusy = "duplicate" | "export" | null;

export interface WorldActions {
  busy: WorldBusy;
  isLocked: (world: IWorld) => boolean;
  duplicate: (world: IWorld) => Promise<void>;
  exportWorld: (world: IWorld) => Promise<void>;
  resetIcon: (world: IWorld) => Promise<void>;
  remove: (world: IWorld) => Promise<void>;
}

export function useWorldActions({
  version,
  isOwner,
  isVersionRunning,
  takenNames,
  onRemoved,
  onRestored,
  onDuplicated,
  onPatched,
}: {
  version: Version | undefined;
  isOwner: boolean;
  isVersionRunning: boolean;
  takenNames: string[];
  onRemoved: (world: IWorld) => void;
  onRestored: (world: IWorld) => void;
  onDuplicated: (folderName: string) => void;
  onPatched: (world: IWorld, patch: Partial<IWorld>) => void;
}): WorldActions {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<WorldBusy>(null);

  const isLocked = (world: IWorld) =>
    !isOwner || Boolean(world.isDownloaded) || isVersionRunning;

  const duplicate = async (world: IWorld) => {
    countFeature("worlds.duplicate");
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

  const exportWorld = async (world: IWorld) => {
    const picked = await api.other.openFileDialog(true);
    if (!picked?.length) return;
    countFeature("worlds.export");

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

  const resetIcon = async (world: IWorld) => {
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

      onPatched(world, { icon: undefined });
    } catch (error) {
      showFailureToast(t("worlds.iconResetError"), error, {
        channels: ["fs:"],
      });
    }
  };

  const remove = async (world: IWorld) => {
    if (!version || isLocked(world)) return;

    await removeWithUndo({
      target: world.path,
      parkDir: version.versionPath,
      title: t("worlds.deleted"),
      description: world.name,
      failTitle: t("worlds.deletedError"),
      failDescription: t("worlds.deletedErrorHint"),
      onRemoved: () => onRemoved(world),
      onRestored: () => onRestored(world),
    });
  };

  return { busy, isLocked, duplicate, exportWorld, resetIcon, remove };
}

export function WorldMenuItems({
  menu,
  world,
  version,
  isOwner,
  isVersionRunning,
  actions,
  onRename,
}: {
  menu: "dropdown" | "context";
  world: IWorld;
  version: Version;
  isOwner: boolean;
  isVersionRunning: boolean;
  actions: WorldActions;
  onRename: () => void;
}) {
  const { t } = useTranslation();
  const Item = menu === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator =
    menu === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const locked = actions.isLocked(world);
  const mapUrl = worldSeedMapUrl(world, version);

  return (
    <>
      <Item disabled={locked} onSelect={onRename}>
        <Pencil />
        <span>{t("common.rename")}</span>
      </Item>

      <Item
        disabled={!isOwner || isVersionRunning || actions.busy !== null}
        onSelect={() => void actions.duplicate(world)}
      >
        <Copy />
        <span>{t("worlds.duplicate")}</span>
      </Item>

      <Item
        disabled={actions.busy !== null || isVersionRunning}
        onSelect={() => void actions.exportWorld(world)}
      >
        <FolderArchive />
        <span>{t("worlds.export")}</span>
      </Item>

      <Item
        disabled={!world.icon || locked}
        onSelect={() => void actions.resetIcon(world)}
      >
        <ImageOff />
        <span>{t("worlds.resetIcon")}</span>
      </Item>

      <Item
        disabled={!version.isQuickPlaySingleplayer}
        onSelect={() =>
          void createDesktopShortcut(version, t, {
            world: world.folderName,
            label: world.name,
          })
        }
      >
        <MonitorDown />
        <span>{t("worlds.createShortcut")}</span>
      </Item>

      <Item
        disabled={!mapUrl}
        onSelect={() => mapUrl && openSeedMap(mapUrl, t)}
      >
        <MapIcon />
        <span>{t("worlds.seedMap")}</span>
      </Item>

      <Item onSelect={() => void api.shell.openPath(world.path)}>
        <FolderOpen />
        <span>{t("worlds.openFolder")}</span>
      </Item>

      <Separator />

      <Item
        variant="destructive"
        disabled={locked}
        onSelect={() => void actions.remove(world)}
      >
        <Trash />
        <span>{t("common.delete")}</span>
      </Item>
    </>
  );
}

export function worldSeedMapUrl(world: IWorld, version: Version): string | null {
  return seedMapUrl({
    seed: world.seed,
    version: world.versionName || version.version.version.id,
    spawn: world.spawn,
  });
}

export function openSeedMap(url: string, t: TFunction) {
  countFeature("worlds.seedMap");
  void api.shell.openExternal(url).catch((error) =>
    showFailureToast(t("settings.about.openLinkFailed"), error, {
      channels: ["shell:openExternal"],
    }),
  );
}
