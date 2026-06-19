import { lazyWithPreload } from "@renderer/utilities/lazyPreload";

const loadAddVersion = () =>
  import("./Modals/Version/AddVersion").then((module) => ({
    default: module.AddVersion,
  }));

export const LazyAddVersion = lazyWithPreload(loadAddVersion);
