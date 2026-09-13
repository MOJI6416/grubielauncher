import {
  LOADER_CHANGE_NOT_FOUND,
  LOADER_CHANGE_RUNNING,
  LOADER_CHANGE_UNVERIFIED,
} from "@/types/InstallationProgress";
import {
  LoaderRequirement,
  compareLoaderVersions,
  findBlockingRequirements,
  isStableLoaderVersion,
} from "@/shared/loaderCompat";

const LOADER_CHANGE_ERROR_KEYS = new Map<string, string>([
  [LOADER_CHANGE_RUNNING, "loaderUpdate.errors.running"],
  [LOADER_CHANGE_UNVERIFIED, "loaderUpdate.errors.unverified"],
  [LOADER_CHANGE_NOT_FOUND, "loaderUpdate.errors.notFound"],
]);

export function loaderChangeErrorKey(error: unknown): string | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return LOADER_CHANGE_ERROR_KEYS.get(message) ?? null;
}

export type LoaderDirection = "current" | "upgrade" | "downgrade";

export interface LoaderVersionOption {
  id: string;
  stable: boolean;
  isCurrent: boolean;
  isLatest: boolean;
  isRollback: boolean;
  direction: LoaderDirection;
  blocked: LoaderRequirement[];
}

export function buildLoaderVersionOptions({
  versions,
  currentId,
  rollbackId,
  requirements,
  minecraftVersion,
}: {
  versions: { id: string }[];
  currentId?: string;
  rollbackId?: string;
  requirements?: LoaderRequirement[] | null;
  minecraftVersion?: string;
}): LoaderVersionOption[] {
  const ids = [
    ...new Set(
      [...versions.map((version) => version.id), currentId, rollbackId].filter(
        (id): id is string => !!id,
      ),
    ),
  ].sort((left, right) => compareLoaderVersions(right, left));

  const latest = ids.find((id) => isStableLoaderVersion(id));

  return ids.map((id) => ({
    id,
    stable: isStableLoaderVersion(id),
    isCurrent: id === currentId,
    isLatest: id === latest,
    isRollback: !!rollbackId && id === rollbackId && id !== currentId,
    direction:
      id === currentId
        ? "current"
        : currentId && compareLoaderVersions(id, currentId) < 0
          ? "downgrade"
          : "upgrade",
    blocked: requirements
      ? findBlockingRequirements(id, requirements, minecraftVersion)
      : [],
  }));
}

export function findLoaderUpdate(
  versions: { id: string }[],
  currentId: string | undefined,
): string | undefined {
  if (!currentId) return undefined;

  let newest: string | undefined;

  for (const { id } of versions) {
    if (!isStableLoaderVersion(id)) continue;
    if (compareLoaderVersions(id, currentId) <= 0) continue;
    if (!newest || compareLoaderVersions(id, newest) > 0) newest = id;
  }

  return newest;
}

export function pickSuggestedLoaderVersion(
  options: LoaderVersionOption[],
): string | undefined {
  const upgrade = options.find(
    (option) =>
      option.direction === "upgrade" &&
      option.stable &&
      option.blocked.length === 0,
  );

  return upgrade?.id ?? options.find((option) => option.isCurrent)?.id;
}

export type LoaderChangeBlock =
  | "readOnly"
  | "noAccount"
  | "running"
  | "installing"
  | "busy"
  | "offline";

export function resolveLoaderChangeBlock({
  isReadOnly,
  hasAccount,
  isRunning,
  isInstallActive,
  isBusy,
  isOnline,
  needsNetwork,
}: {
  isReadOnly: boolean;
  hasAccount: boolean;
  isRunning: boolean;
  isInstallActive: boolean;
  isBusy: boolean;
  isOnline: boolean;
  needsNetwork: boolean;
}): LoaderChangeBlock | null {
  if (isReadOnly) return "readOnly";
  if (!hasAccount) return "noAccount";
  if (isRunning) return "running";
  if (isInstallActive) return "installing";
  if (isBusy) return "busy";
  if (needsNetwork && !isOnline) return "offline";
  return null;
}
