import {
  isSharedGroup,
  type SharedInstanceChoice,
  type SharedInstanceRef,
  type SharedInstanceStatus,
  type SharedOverview,
  type SharedProfileSummary,
} from "@/types/SharedSettings";
import { LOADERS } from "@/types/Loader";
import type { IServer } from "@/types/ServersList";
import { check, handleSafe } from "../utilities/ipc";
import { assertWritablePath } from "../utilities/safePath";
import {
  configureShared,
  markNewInstance,
  ownServers,
  releaseSharedServers,
  setAutoConnect,
  sharedOverview,
  sharedStatus,
} from "../game/sharedSettings/sync";

const isPath = check.nonEmptyString(4096);
const isServerList = check.arrayOf(check.object(), 5000);

const isRef = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const ref = value as Partial<SharedInstanceRef>;
  return (
    typeof ref.versionPath === "string" &&
    ref.versionPath.length > 0 &&
    ref.versionPath.length <= 4096 &&
    typeof ref.mcVersion === "string" &&
    ref.mcVersion.length <= 128 &&
    (LOADERS as readonly unknown[]).includes(ref.loader) &&
    (ref.shareCode === undefined ||
      (typeof ref.shareCode === "string" && ref.shareCode.length <= 128))
  );
};

const isChoice = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const choice = value as Partial<SharedInstanceChoice>;
  return (
    typeof choice.connected === "boolean" &&
    Array.isArray(choice.off) &&
    choice.off.every(isSharedGroup)
  );
};

const isPathList = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length <= 5000 &&
  value.every(
    (item) =>
      typeof item === "string" && item.length > 0 && item.length <= 4096,
  );

function emptyStatus(): SharedInstanceStatus {
  return {
    connected: false,
    pending: false,
    off: [],
    blocked: {},
    hasBackup: false,
  };
}

function pick(ref: SharedInstanceRef): SharedInstanceRef {
  return {
    versionPath: ref.versionPath,
    mcVersion: ref.mcVersion,
    loader: ref.loader,
    shareCode: ref.shareCode || undefined,
  };
}

export function registerSharedSettingsIpc() {
  handleSafe<SharedInstanceStatus, [SharedInstanceRef]>(
    "sharedSettings:status",
    emptyStatus(),
    [isRef],
    async (_, ref) => {
      assertWritablePath(ref.versionPath, "sharedSettings:status");
      return sharedStatus(pick(ref));
    },
  );

  handleSafe<
    SharedInstanceStatus | null,
    [SharedInstanceRef, SharedInstanceChoice]
  >(
    "sharedSettings:configure",
    null,
    [isRef, isChoice],
    async (_, ref, choice) => {
      assertWritablePath(ref.versionPath, "sharedSettings:configure");
      return configureShared(pick(ref), {
        connected: choice.connected,
        off: choice.off.filter(isSharedGroup),
      });
    },
  );

  handleSafe<boolean, [string]>(
    "sharedSettings:markNew",
    false,
    [isPath],
    async (_, versionPath) => {
      assertWritablePath(versionPath, "sharedSettings:markNew");
      await markNewInstance(versionPath);
      return true;
    },
  );

  handleSafe<SharedOverview | null, [string[]]>(
    "sharedSettings:overview",
    null,
    [isPathList],
    async (_, versionPaths) => {
      for (const versionPath of versionPaths) {
        assertWritablePath(versionPath, "sharedSettings:overview");
      }
      return sharedOverview(versionPaths);
    },
  );

  handleSafe<SharedProfileSummary | null, [boolean]>(
    "sharedSettings:setAutoConnect",
    null,
    [check.boolean()],
    async (_, value) => setAutoConnect(value),
  );

  handleSafe<IServer[] | null, [SharedInstanceRef, IServer[]]>(
    "sharedSettings:ownServers",
    null,
    [isRef, isServerList],
    async (_, ref, servers) => {
      assertWritablePath(ref.versionPath, "sharedSettings:ownServers");
      return ownServers(pick(ref), servers);
    },
  );

  handleSafe<boolean, [SharedInstanceRef]>(
    "sharedSettings:release",
    false,
    [isRef],
    async (_, ref) => {
      assertWritablePath(ref.versionPath, "sharedSettings:release");
      return releaseSharedServers(pick(ref));
    },
  );
}
