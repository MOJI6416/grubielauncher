import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  CircleUserRound,
  Copy,
  CopyPlus,
  CopySlash,
  Folder,
  FolderArchive,
  LayoutDashboard,
  MonitorDown,
  Play,
  ScanLine,
  SquareTerminal,
  Tag,
  Trash,
} from "lucide-react";
import { toast } from "sonner";
import { getDefaultStore } from "jotai";
import type { TFunction } from "i18next";
import type { ILocalAccount } from "@/types/Account";
import type { LaunchShortcutTarget } from "@/shared/launchLink";
import { Version } from "@renderer/classes/Version";
import { showFailureToast } from "@renderer/utilities/failures";
import { accountsAtom } from "@renderer/stores/atoms";
import { playAsVersionAtom } from "@renderer/features/launch/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { getDeleteCopy, isForeignPublication } from "./deleteGates";
import { instanceKey } from "./selectors";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

export interface InstanceAction {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  destructive?: boolean;
  shortcut?: string;
  busy?: boolean;
  hint?: string;
  blockedReason?: string;
  onSelect: () => void;
}

export interface InstanceScreenTools {
  isLoading: boolean;
  loadingType?: string;
  isOnline: boolean;
  hasAccount: boolean;
  devMode: boolean;
  onCheckIntegrity: () => void;
  onExport: () => void;
  onCopyRunCommand: (relative: boolean) => void;
  onCreateShortcut: () => void;
}

export interface InstanceActionContext {
  instance: Version;
  t: TFunction;
  canPlay: boolean;
  isRunningInstance: boolean;
  onPlay: () => void;
  onPlayAnother: () => void;
  onManageTags?: () => void;
  onDuplicate: () => void;
  onPort: () => void;
  onDelete?: () => void;
  account?: ILocalAccount | null;
  isBusy?: boolean;
  deleteShortcut?: string;
  screen?: InstanceScreenTools;
}

export const OVERVIEW_TILE_IDS = [
  "folder",
  "integrity",
  "export",
  "shortcut",
  "play-as",
] as const;

export async function createDesktopShortcut(
  instance: Version,
  t: TFunction,
  target?: LaunchShortcutTarget,
): Promise<void> {
  try {
    const result = await api.shortcut.create(
      instance.version.name,
      0,
      instance.version.image || undefined,
      target,
    );

    if (result?.success) {
      countFeature(
        target?.world
          ? "shortcut.world"
          : target?.server
            ? "shortcut.server"
            : "shortcut.instance",
      );
      toast.success(t("versions.shortcutCreated"));
      return;
    }

    showFailureToast(t("versions.shortcutFailed"), undefined, {
      channels: ["shortcut:create"],
      fallbackDescription: result?.error,
    });
  } catch (error) {
    showFailureToast(t("versions.shortcutFailed"), error);
  }
}

export function buildInstanceActions(
  context: InstanceActionContext,
): InstanceAction[][] {
  const { instance, t, screen } = context;
  const busy = context.isBusy === true || screen?.isLoading === true;

  const launch: InstanceAction[] = [
    context.isRunningInstance
      ? {
          id: "play-another",
          label: t("versions.playAnotherInstance"),
          icon: CopyPlus,
          disabled: !context.canPlay,
          onSelect: context.onPlayAnother,
        }
      : {
          id: "play",
          label: t("nav.play"),
          icon: Play,
          disabled: !context.canPlay,
          onSelect: context.onPlay,
        },
  ];

  const store = getDefaultStore();
  if (store.get(accountsAtom).length > 1) {
    launch.push({
      id: "play-as",
      label: t("playAs.menu"),
      icon: CircleUserRound,
      disabled: !context.canPlay,
      hint: t("playAs.hint"),
      onSelect: () => store.set(playAsVersionAtom, instance),
    });
  }

  const groups: InstanceAction[][] = [launch];

  if (!screen) {
    groups.push([
      {
        id: "overview",
        label: t("versions.openInstance"),
        icon: LayoutDashboard,
        onSelect: () =>
          navigate({ name: "instance", id: instanceKey(instance) }),
      },
    ]);
  }

  const tools: InstanceAction[] = [
    {
      id: "duplicate",
      label: t("versions.duplicate"),
      icon: Copy,
      disabled: context.isRunningInstance || busy,
      onSelect: context.onDuplicate,
    },
    {
      id: "port",
      label: t("versions.port"),
      icon: ArrowRightLeft,
      disabled: busy,
      onSelect: context.onPort,
    },
    {
      id: "folder",
      label: t("common.openFolder"),
      icon: Folder,
      onSelect: () => void api.shell.openPath(instance.versionPath),
    },
    {
      id: "shortcut",
      label: t("versions.createShortcut"),
      icon: MonitorDown,
      hint: t("versions.shortcutHint"),
      busy: screen?.isLoading === true && screen.loadingType === "shortcut",
      disabled: screen?.isLoading === true,
      onSelect: screen
        ? screen.onCreateShortcut
        : () => void createDesktopShortcut(instance, t),
    },
  ];

  if (screen) {
    const integrityBlocked = !screen.isOnline
      ? t("versions.integrityBlocked.offline")
      : context.isRunningInstance
        ? t("versions.integrityBlocked.running")
        : undefined;

    tools.push(
      {
        id: "export",
        label: t("export.btn"),
        icon: FolderArchive,
        hint: t("export.contents"),
        disabled: screen.isLoading,
        onSelect: screen.onExport,
      },
      {
        id: "integrity",
        label: t("versions.checkIntegrity"),
        icon: ScanLine,
        hint: t("versions.integrityHint"),
        busy: screen.isLoading && screen.loadingType === "check",
        disabled: screen.isLoading || Boolean(integrityBlocked),
        blockedReason: integrityBlocked,
        onSelect: screen.onCheckIntegrity,
      },
      {
        id: "run-command",
        label: t("versions.runCommand"),
        icon: SquareTerminal,
        disabled: screen.isLoading || !screen.hasAccount,
        onSelect: () => screen.onCopyRunCommand(false),
      },
    );

    if (screen.devMode) {
      tools.push({
        id: "run-command-relative",
        label: t("versions.copyRelativePath"),
        icon: CopySlash,
        disabled: screen.isLoading || !screen.hasAccount,
        onSelect: () => screen.onCopyRunCommand(true),
      });
    }
  }

  if (context.onManageTags) {
    tools.push({
      id: "tags",
      label: t("versions.tags.edit"),
      icon: Tag,
      onSelect: context.onManageTags,
    });
  }

  groups.push(tools);

  if (!context.onDelete) return groups;

  const foreignPublication = isForeignPublication({
    shareCode: instance.version.shareCode,
    owner: instance.version.owner,
    ownerId: instance.version.ownerId,
    account: context.account,
  });

  groups.push([
    {
      id: "delete",
      label: t(getDeleteCopy({ foreignPublication }).menuKey),
      icon: Trash,
      destructive: true,
      shortcut: context.deleteShortcut,
      disabled: context.isRunningInstance || busy,
      onSelect: context.onDelete,
    },
  ]);

  return groups;
}

export function pickActions(
  groups: InstanceAction[][],
  ids: readonly string[],
): InstanceAction[] {
  const flat = groups.flat();
  return ids.flatMap((id) => flat.filter((action) => action.id === id));
}
