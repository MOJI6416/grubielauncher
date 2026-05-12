import { ILocalAccount } from "@/types/Account";
import { IModpack } from "@/types/Backend";
import { IVersionConf } from "@/types/IVersion";
import { IServer } from "@/types/ServersList";
import { Mods } from "@renderer/classes/Mods";
import { TSettings } from "@/types/Settings";
import { Version } from "@renderer/classes/Version";
import { IArguments } from "@/types/IArguments";
import { ILocalProject } from "@/types/ModManager";
import {
  areOtherFilesEqual,
  areRunArgumentsEqual,
  formatShareDiffParts,
  getShareDiffParts,
  preserveLocalBlockedPaths,
} from "./shareSyncPure";
export {
  checkVersionName,
  forbiddenSymbols,
  isOwner,
  parseVersionOwner,
} from "./versionPure";

const api = window.api;

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

    try {
      const versionMods = new Mods(settings, version.version);

      await versionMods.check();
      if (isOther) await versionMods.downloadOther();
    } catch (error) {
      version.version.loader.mods = previousMods;
      version.version.loader.other = previousOther;
      throw error;
    }
  }

  if (!(await api.servers.compare(modpack.conf.servers, servers))) {
    const serversPath = await api.path.join(version.versionPath, "servers.dat");
    await api.servers.write(modpack.conf.servers, serversPath);
  }

  if (modpack.build != version.version.build) {
    version.version.build = modpack.build;
  }

  if (modpack.conf.image != version.version.image) {
    const logoPath = await api.path.join(version.versionPath, "logo.png");
    version.version.image = modpack.conf.image;
    if (modpack.conf.image) {
      try {
        const newFile = await fetch(modpack.conf.image).then((r) => r.blob());
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

  await version.save();
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
) {
  if (!version.shareCode) return "";

  const isOwner = !version.downloadedVersion && version.shareCode;

  const modpackData = await api.backend.getModpack(at, version.shareCode);
  if (!modpackData.data) throw Error("not found");

  const modpack = modpackData.data;

  const modsEqual = await api.modManager.compareMods(
    modpack.conf.loader.mods,
    mods,
  );
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
  const versions: Version[] = [];

  for (let index = 0; index < directories.length; index++) {
    const directory = directories[index];

    const confPath = await api.path.join(
      versionsPath,
      directory,
      "version.json",
    );

    if (!(await api.fs.pathExists(confPath))) continue;

    const conf: IVersionConf = await api.fs.readJSON(confPath, "utf-8");
    if (conf.name != directory) conf.name = directory;

    const version = new Version(conf);

    await version.init();

    if (!version.manifest) continue;

    let isUpdated = false;

    if (!conf.owner && account) {
      version.version.owner = `${account.type}_${account.nickname}`;
      isUpdated = true;
    }

    if (isUpdated) await version.save();

    versions.push(version);
  }

  return versions;
}
