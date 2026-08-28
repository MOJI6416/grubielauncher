import type { Loader } from "@/types/Loader";
import { loaderRequiresBackend } from "@renderer/utilities/connectivity";
import type { VersionKind } from "./versionCatalog";

export type CreationBlocker =
  | "account"
  | "internet"
  | "backend"
  | "name"
  | "minecraftVersion"
  | "loaderVersion"
  | "loaderVersionUnresolved";

export type CreationWarning =
  | "localMods"
  | "snapshot"
  | "oldVersion"
  | "legacyJava"
  | "backend"
  | "largeDownload";

export const LARGE_DOWNLOAD_BYTES = 700 * 1024 * 1024;

export interface CreationInput {
  hasAccount: boolean;
  isInternetOnline: boolean;
  isBackendOnline: boolean;
  loader: Loader;
  nameOk: boolean;
  hasMinecraftVersion: boolean;
  hasLoaderVersion: boolean;
  loaderVersionUnresolved: boolean;
}

export interface WarningInput {
  versionKind: VersionKind | null;
  javaMajor: number | null;
  hasLocalMods: boolean;
  bytes: number;
  isBackendOnline: boolean;
  needsBackend: boolean;
}

export function creationBlockers(input: CreationInput): CreationBlocker[] {
  const blockers: CreationBlocker[] = [];

  if (!input.hasAccount) blockers.push("account");
  if (!input.isInternetOnline) blockers.push("internet");
  if (loaderRequiresBackend(input.loader) && !input.isBackendOnline) {
    blockers.push("backend");
  }
  if (!input.nameOk) blockers.push("name");
  if (!input.hasMinecraftVersion) blockers.push("minecraftVersion");
  if (input.loader !== "vanilla" && !input.hasLoaderVersion) {
    blockers.push("loaderVersion");
  }
  if (input.loaderVersionUnresolved) blockers.push("loaderVersionUnresolved");

  return blockers;
}

export function canCreate(input: CreationInput): boolean {
  return creationBlockers(input).length === 0;
}

export function creationWarnings(input: WarningInput): CreationWarning[] {
  const warnings: CreationWarning[] = [];

  if (input.hasLocalMods) warnings.push("localMods");
  if (input.versionKind === "snapshot") warnings.push("snapshot");
  if (input.versionKind === "old") warnings.push("oldVersion");
  if (input.javaMajor !== null && input.javaMajor <= 8) {
    warnings.push("legacyJava");
  }
  if (input.needsBackend && !input.isBackendOnline) warnings.push("backend");
  if (input.bytes >= LARGE_DOWNLOAD_BYTES) warnings.push("largeDownload");

  return warnings;
}
