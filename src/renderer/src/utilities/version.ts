import { ILocalAccount } from "@/types/Account";
import { IModpack } from "@/types/Backend";
import { IServerConf } from "@/types/Server";
import { IVersionConf } from "@/types/IVersion";
import { IServer } from "@/types/ServersList";
import { Mods } from "@renderer/classes/Mods";
import { TSettings } from "@/types/Settings";
import { Version } from "@renderer/classes/Version";
import { IArguments } from "@/types/IArguments";
import { ILocalProject } from "@/types/ModManager";
import i18n from "@renderer/i18n";
import { getDefaultStore } from "jotai";
import {
  accountAtom,
  pathsAtom,
  versionsAtom,
  versionsLoadedAtom,
  versionsUnreadableAtom,
} from "@renderer/stores/atoms";
import { isSafeVersionName } from "@/shared/versionName";
import {
  consumeRecentFailure,
  describeFailure,
  showFailureToast,
} from "./failures";
import { showErrorToast } from "./errorToast";
import { toast } from "sonner";
import {
  ShareSyncInterruptedError,
  areOtherFilesEqual,
  areRunArgumentsEqual,
  formatShareDiffParts,
  getShareDiffParts,
  isShareSyncInterrupted,
  preserveLocalBlockedPaths,
  shouldReportStaleLocalShareFiles,
} from "./shareSyncPure";
import { ownerRecordFor } from "./versionPure";
export {
  isOwner,
  parseVersionOwner,
  sanitizeExtraFileSegments,
} from "./versionPure";

const api = window.api;

// Says out loud that the instance is now between two states. Used by every
// caller of syncShare, cancellation included: `showFailureToast` deliberately
// stays quiet on a cancelled operation, which is exactly the case that leaves
// the most files half-replaced.
export function reportShareSyncInterruption(error: unknown): boolean {
  if (!isShareSyncInterrupted(error)) return false;

  const title = i18n.t("versions.syncInterrupted");
  const hint = i18n.t("versions.syncInterruptedHint");

  if (error.isCancelled) {
    toast.warning(title, { description: hint, duration: 12000 });
    return true;
  }

  const cause = error.cause;
  showErrorToast(
    title,
    hint,
    i18n.t("common.copy"),
    undefined,
    cause instanceof Error ? cause.message : undefined,
  );

  return true;
}

export async function syncShare(
  version: Version,
  servers: IServer[],
  settings: TSettings,
  at: string,
  modpackOverride?: IModpack,
) {
  if (!version || !version.version.shareCode)
    throw Error("not selected version");

  const modpack =
    modpackOverride ||
    (await api.backend.getModpack(at, version.version.shareCode)).data;
  if (!modpack) throw Error("not share version");

  const previousOther = version.version.loader.other;
  let isOther = false;
  if (
    !areOtherFilesEqual(modpack.conf.loader.other, version.version.loader.other)
  ) {
    version.version.loader.other = modpack.conf.loader.other;
    isOther = true;
  }

  if (
    !(await api.modManager.compareMods(
      version.version.loader.mods,
      modpack.conf.loader.mods,
    )) ||
    isOther
  ) {
    const previousMods = version.version.loader.mods;

    preserveLocalBlockedPaths(
      version.version.loader.mods,
      modpack.conf.loader.mods,
    );
    version.version.loader.mods = modpack.conf.loader.mods;

    let serverConf: IServerConf | undefined;
    try {
      const serverConfPath = await api.path.join(
        version.versionPath,
        "server",
        "conf.json",
      );
      if (await api.fs.pathExists(serverConfPath)) {
        serverConf =
          (await api.fs.readJSON<IServerConf>(serverConfPath, "utf-8")) ??
          undefined;
      }
    } catch {
      serverConf = undefined;
    }

    try {
      const versionMods = new Mods(settings, version.version, serverConf);

      await versionMods.check();
      if (isOther) await versionMods.downloadOther();
    } catch (error) {
      version.version.loader.mods = previousMods;
      version.version.loader.other = previousOther;
      throw new ShareSyncInterruptedError(error);
    }
  }

  let serversWritten = true;
  if (!(await api.servers.compare(modpack.conf.servers, servers))) {
    const serversPath = await api.path.join(version.versionPath, "servers.dat");
    serversWritten = await api.servers.write(modpack.conf.servers, serversPath);
  }

  if (modpack.build != version.version.build) {
    version.version.build = modpack.build;
  }

  if ((modpack.conf.description || "") !== (version.version.description || "")) {
    version.version.description = modpack.conf.description || "";
  }

  if (modpack.conf.image != version.version.image) {
    const logoPath = await api.path.join(version.versionPath, "logo.png");
    version.version.image = modpack.conf.image;
    if (modpack.conf.image) {
      try {
        const response = await fetch(modpack.conf.image);
        if (!response.ok) throw new Error("logo fetch failed");
        const newFile = await response.blob();
        await api.fs.writeFile(
          logoPath,
          new Uint8Array(await newFile.arrayBuffer()),
        );
      } catch {}
    } else {
      await api.fs.rimraf(logoPath);
    }
  }

  if (
    !areRunArgumentsEqual(
      modpack.conf.runArguments,
      version.version.runArguments,
    )
  ) {
    version.version.runArguments = modpack.conf.runArguments;
  }

  if (modpack.conf.quickServer != version.version.quickServer) {
    version.version.quickServer = modpack.conf.quickServer;
  }

  if (!(await version.save())) {
    throw new Error("share sync did not save the instance config");
  }

  if (!serversWritten) {
    throw new Error("share sync did not write servers.dat");
  }

  return version;
}

export async function checkDiffenceUpdateData(
  {
    version,
    versionPath,
    servers,
    mods,
    runArguments,
    logo,
    quickServer,
  }: {
    version: IVersionConf;
    versionPath: string;
    servers: IServer[];
    mods: ILocalProject[];
    runArguments: IArguments;
    logo: string;
    quickServer: string | undefined;
  },
  at: string,
  modpackOverride?: IModpack,
) {
  if (!version.shareCode) return "";

  const isOwner = !version.downloadedVersion && version.shareCode;

  const modpack =
    modpackOverride ||
    (await api.backend.getModpack(at, version.shareCode)).data;
  if (!modpack) throw Error("not found");

  const hasStaleLocalShareFiles = shouldReportStaleLocalShareFiles(
    !!isOwner,
    mods,
    version.shareCode,
  );
  const modsEqual =
    (await api.modManager.compareMods(modpack.conf.loader.mods, mods)) &&
    !hasStaleLocalShareFiles;
  const serversEqual = await api.servers.compare(modpack.conf.servers, servers);

  const optionsPath = await api.path.join(versionPath, "options.txt");
  let options = "";

  if (await api.fs.pathExists(optionsPath))
    options = await api.fs.readFile(optionsPath, "utf-8");

  const diff = formatShareDiffParts(
    getShareDiffParts({
      isOwner: !!isOwner,
      remoteName: modpack.conf.name,
      currentName: version.name,
      remoteDescription: modpack.conf.description,
      currentDescription: version.description,
      remoteImage: modpack.conf.image,
      currentLogo: logo,
      modsEqual,
      serversEqual,
      remoteQuickServer: modpack.conf.quickServer,
      currentQuickServer: quickServer,
      remoteRunArguments: modpack.conf.runArguments,
      currentRunArguments: runArguments,
      remoteOptions: modpack.conf.options,
      currentOptions: options,
      remoteOther: modpack.conf.loader.other,
      currentOther: version.loader.other,
    }),
  );

  return diff;
}

export class InstanceLibraryUnreadableError extends Error {
  readonly code = "instance_library_unreadable";
  readonly reason: string;

  constructor(reason: string) {
    super("Instance library could not be read");
    this.name = "InstanceLibraryUnreadableError";
    this.reason = reason;
  }
}

export async function readVerions(
  launcherPath: string,
  account: ILocalAccount | null,
) {
  const versionsPath = await api.path.join(
    launcherPath,
    "minecraft",
    "versions",
  );
  const directories = await api.fs.getDirectories(versionsPath);

  if (directories.length === 0) {
    const failure = consumeRecentFailure({ channels: ["fs:getDirectories"] });
    if (failure) {
      throw new InstanceLibraryUnreadableError(
        failure.cause === "unknown"
          ? i18n.t("versions.libraryUnreadableHint")
          : `${i18n.t("versions.libraryUnreadableHint")}
${describeFailure(failure).text}`,
      );
    }
  }

  const results = await Promise.all(
    directories.map(async (directory) => {
      try {
        const confPath = await api.path.join(
          versionsPath,
          directory,
          "version.json",
        );

        if (!(await api.fs.pathExists(confPath))) return null;

        if (!isSafeVersionName(directory)) {
          showErrorToast(
            `${i18n.t("versions.notFound")}: ${directory}`,
            i18n.t("versions.unsafeFolderName"),
            "",
            `version-read-${directory}`,
          );

          return null;
        }

        const conf: IVersionConf | null = await api.fs.readJSON(
          confPath,
          "utf-8",
        );
        if (!conf) throw new Error(`Unreadable version config: ${confPath}`);

        if (conf.name != directory) conf.name = directory;

        const version = new Version(conf);

        await version.init();

        let isUpdated = false;

        if (!conf.owner && !conf.ownerId && account) {
          Object.assign(version.version, ownerRecordFor(account));
          isUpdated = true;
        }

        if (isUpdated) await version.save();

        return version;
      } catch (error) {
        console.error(`[versions] failed to read version ${directory}`, error);

        showFailureToast(`${i18n.t("versions.notFound")}: ${directory}`, error, {
          channels: ["fs:readJSON", "version:init"],
          toastId: `version-read-${directory}`,
        });

        return null;
      }
    }),
  );

  return results.filter((version): version is Version => version !== null);
}

export async function reloadInstanceLibrary(): Promise<boolean> {
  const store = getDefaultStore();
  const { launcher } = store.get(pathsAtom);
  if (!launcher) return false;

  store.set(versionsUnreadableAtom, null);
  store.set(versionsLoadedAtom, false);

  try {
    const instances = await readVerions(
      launcher,
      store.get(accountAtom) ?? null,
    );
    store.set(versionsAtom, instances);
    return true;
  } catch (error) {
    store.set(
      versionsUnreadableAtom,
      error instanceof InstanceLibraryUnreadableError
        ? error.reason
        : i18n.t("versions.libraryUnreadableHint"),
    );
    return false;
  } finally {
    store.set(versionsLoadedAtom, true);
  }
}
