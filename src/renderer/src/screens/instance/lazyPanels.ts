import { useEffect } from "react";
import {
  lazyWithPreload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";

export const LazyServersPanel = lazyWithPreload(() =>
  import("@renderer/features/servers/ServersPanel").then((module) => ({
    default: module.ServersPanel,
  })),
);

export const LazyShare = lazyWithPreload(() =>
  import("@renderer/features/share/Share").then((module) => ({
    default: module.Share,
  })),
);

export const LazyExport = lazyWithPreload(() =>
  import("@renderer/components/Export").then((module) => ({
    default: module.Export,
  })),
);

export const LazyImageCropper = lazyWithPreload(() =>
  import("@renderer/components/ImageCropper").then((module) => ({
    default: module.ImageCropper,
  })),
);

export const LazyModManager = lazyWithPreload(() =>
  import("@renderer/features/mods/ContentManager").then((module) => ({
    default: module.ContentManager,
  })),
);

export const LazyArguments = lazyWithPreload(() =>
  import("@renderer/components/Arguments").then((module) => ({
    default: module.Arguments,
  })),
);

export const LazyServerControl = lazyWithPreload(() =>
  import("@renderer/features/servers/ServerControlPanel").then((module) => ({
    default: module.ServerControlPanel,
  })),
);

export const LazyDeleteVersion = lazyWithPreload(() =>
  import("@renderer/features/instances/DeleteVersion").then((module) => ({
    default: module.DeleteVersion,
  })),
);

export const LazyWorlds = lazyWithPreload(() =>
  import("@renderer/features/worlds/WorldsPanel").then((module) => ({
    default: module.Worlds,
  })),
);

export const LazyLogs = lazyWithPreload(() =>
  import("@renderer/features/logs/LogsPanel").then((module) => ({
    default: module.LogsPanel,
  })),
);

export function useInstancePanelPreload() {
  useEffect(() => {
    return schedulePreload(
      [
        LazyServersPanel.preload,
        LazyShare.preload,
        LazyExport.preload,
        LazyImageCropper.preload,
        LazyModManager.preload,
        LazyArguments.preload,
        LazyServerControl.preload,
        LazyDeleteVersion.preload,
        LazyWorlds.preload,
      ],
      900,
    );
  }, []);
}
