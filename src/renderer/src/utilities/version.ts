import { ILocalAccount } from "@/types/Account";
import { IVersionConf } from "@/types/IVersion";
import { IServer } from "@/types/ServersList";
import { Mods } from "@renderer/classes/Mods";
import { ILocalProject } from "@/types/ModManager";
import { TSettings } from "@/types/Settings";
import { IArguments } from "@/types/IArguments";
import { Version } from "@renderer/classes/Version";

const api = window.api;

export function isOwner(owner?: string, account?: ILocalAccount) {
  if (!owner || !account) return false;

  return `${account.type}_${account.nickname}` === owner;
}

export const forbiddenSymbols: string[] = [
  "\\",
  "/",
  ":",
  "*",
  "?",
  '"',
  "<",
  ">",
  "|",
];

export function checkVersionName(
  versionName: string,
  versions: IVersionConf[],
  selectedVersion?: IVersionConf,
  isDownloaded?: boolean,
) {
  const name = versionName.trim();

  if (name == "" && selectedVersion) return false;

  if (name.length > 32) return false;

  if (
    !!versions.find(
      (v) => v.name.toLocaleLowerCase() == name.toLocaleLowerCase(),
    ) &&
    (selectedVersion
      ? name != selectedVersion?.name || (!selectedVersion && isDownloaded)
      : true)
  )
    return false;

  for (let index = 0; index < forbiddenSymbols.length; index++) {
    const s = forbiddenSymbols[index];
    if (name.trim().includes(s)) return false;
  }

  return true;
}

export async function syncShare(
  version: Version,
  servers: IServer[],
  settings: TSettings,
  at: string,
) {
  if (!version || !version.version.shareCode)
    throw Error("not selected version");

  const modpackData = await api.backend.getModpack(
    at,
    version.version.shareCode,
  );
  if (!modpackData.data) throw Error("not share version");

  const modpack = modpackData.data;

  let isOther = false;
  if (modpack.conf.loader.other?.size != version.version.loader.other?.size) {
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
    version.version.loader.mods = modpack.conf.loader.mods;

    const versionMods = new Mods(settings, version.version);

    await versionMods.check();
    if (isOther) await versionMods.downloadOther();
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
      const newFile = await fetch(modpack.conf.image).then((r) => r.blob());
      await api.fs.writeFile(
        logoPath,
        new Uint8Array(await newFile.arrayBuffer()),
      );
    } else {
      await api.fs.rimraf(logoPath);
    }
  }

  if (modpack.conf.runArguments != version.version.runArguments) {
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

  let diff = "";

  const modpackData = await api.backend.getModpack(at, version.shareCode);
  if (!modpackData.data) throw Error("not found");

  const modpack = modpackData.data;

  if (isOwner && modpack.conf.name != version.name) diff += "name" + ", ";

  if (modpack.conf.image !== logo) diff += "logo" + ", ";

  if (!(await api.modManager.compareMods(modpack.conf.loader.mods, mods)))
    diff += "mods" + ", ";
  if (
    !(await api.servers.compare(modpack.conf.servers, servers)) ||
    modpack.conf.quickServer != (quickServer || "")
  )
    diff += "servers" + ", ";

  if (
    (modpack.conf?.runArguments?.game || "") != runArguments.game ||
    (modpack.conf?.runArguments?.jvm || "") != runArguments.jvm
  )
    diff += "arguments" + ", ";

  const optionsPath = await api.path.join(versionPath, "options.txt");
  let options = "";

  if (await api.fs.pathExists(optionsPath))
    options = await api.fs.readFile(optionsPath, "utf-8");

  if (isOwner && modpack.conf.options != options) diff += "options" + ", ";

  if (isOwner) diff += "other" + ", ";
  else {
    if (modpack.conf.loader.other?.size != version.loader.other?.size)
      diff += "other" + ", ";
  }

  console.log(diff, "diff");

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
