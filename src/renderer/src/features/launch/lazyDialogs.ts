import { lazyWithPreload } from "@renderer/utilities/lazyPreload";

export const LazyBlockedMods = lazyWithPreload(() =>
  import("@renderer/components/Modals/BlockedMods").then((module) => ({
    default: module.BlockedMods,
  })),
);
