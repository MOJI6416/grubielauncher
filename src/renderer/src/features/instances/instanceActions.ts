import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  ChartArea,
  CopyPlus,
  Folder,
  Globe2,
  LayoutDashboard,
  MonitorDown,
  Play,
  ScrollText,
  Server,
  ServerCog,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import { Version } from "@renderer/classes/Version";
import { showFailureToast } from "@renderer/utilities/failures";
import { navigate } from "@renderer/navigation/navigate";
import type { InstanceTab } from "@renderer/navigation/routes";
import { instanceKey } from "./selectors";

const api = window.api;

export interface InstanceAction {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onSelect: () => void;
}

export interface InstanceActionContext {
  instance: Version;
  t: TFunction;
  canPlay: boolean;
  isRunningInstance: boolean;
  hasSaves: boolean;
  hasServer: boolean;
  hasStatistics: boolean;
  onPlay: () => void;
  onPlayAnother: () => void;
  onManageTags: () => void;
}

export async function createDesktopShortcut(
  instance: Version,
  t: TFunction,
): Promise<void> {
  try {
    const result = await api.shortcut.create(
      instance.version.name,
      0,
      instance.version.image || undefined,
    );

    if (result?.success) {
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
  const { instance, t } = context;
  const open = (tab?: InstanceTab) =>
    navigate({ name: "instance", id: instanceKey(instance), tab });

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

  const sections: InstanceAction[] = [
    {
      id: "overview",
      label: t("versions.openInstance"),
      icon: LayoutDashboard,
      onSelect: () => open(),
    },
    {
      id: "content",
      label: t("shell.tabs.content"),
      icon: Boxes,
      onSelect: () => open("content"),
    },
  ];

  if (context.hasSaves) {
    sections.push({
      id: "worlds",
      label: t("shell.tabs.worlds"),
      icon: Globe2,
      onSelect: () => open("worlds"),
    });
  }

  if (instance.version.version?.serverManager) {
    sections.push({
      id: "servers",
      label: t("shell.tabs.servers"),
      icon: Server,
      onSelect: () => open("servers"),
    });
  }

  if (context.hasServer) {
    sections.push({
      id: "server",
      label: t("versions.serverManager"),
      icon: ServerCog,
      onSelect: () => open("server"),
    });
  }

  sections.push({
    id: "settings",
    label: t("shell.tabs.settings"),
    icon: SlidersHorizontal,
    onSelect: () => open("settings"),
  });

  if (context.hasStatistics) {
    sections.push({
      id: "statistics",
      label: t("versionStatistics.title"),
      icon: ChartArea,
      onSelect: () => open("statistics"),
    });
  }

  sections.push({
    id: "logs",
    label: t("shell.tabs.logs"),
    icon: ScrollText,
    onSelect: () => open("logs"),
  });

  const tools: InstanceAction[] = [
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
      onSelect: () => void createDesktopShortcut(instance, t),
    },
    {
      id: "tags",
      label: t("versions.tags.manage"),
      icon: Tag,
      onSelect: context.onManageTags,
    },
  ];

  return [launch, sections, tools];
}
