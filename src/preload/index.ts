import { contextBridge, ipcRenderer } from "electron";
import { IServer } from "@/types/ServersList";
import {
  IImportModpack,
  IVersion,
  IVersionClassData,
  IVersionConf,
} from "@/types/IVersion";
import { IAccountConf, IAuth, ILocalAccount } from "@/types/Account";
import { IModpack, IModpackUpdate } from "@/types/Backend";
import { IUpdateUser, IUser } from "@/types/IUser";
import { INews } from "@/types/News";
import { IGrubieSkin, SkinsData } from "@/types/SkinManager";
import { LoaderVersion } from "@/types/VersionsService";
import { TSettings } from "@/types/Settings";
import {
  IServerConf,
  IServerOption,
  IServerSettings,
  ServerCore,
} from "@/types/Server";
import { DownloaderInfo, DownloadItem } from "@/types/Downloader";
import { Loader } from "@/types/Loader";
import {
  IFilterGroup,
  ILocalFileInfo,
  IProject,
  ISearchData,
  IVersionDependency,
  ProjectType,
  Provider,
  IVersion as IVersionModManager,
  IModpack as IModpackModManager,
  ILocalProject,
} from "@/types/ModManager";
import * as DiscordRPC from "discord-rpc";
import { ISkinData } from "@/types/Skin";
import { IWorld, IWorldStatistics } from "@/types/World";
import { IAuthlib } from "@/types/IAuthlib";
import { IAuthResponse, IRefreshTokenResponse } from "@/types/Auth";

export interface IElectronAPI {
  os: {
    totalmem: () => Promise<number>;
  };
  path: {
    join: (...args: string[]) => Promise<string>;
    basename: (filePath: string, suffix?: string) => Promise<string>;
    extname: (filePath: string) => Promise<string>;
  };
  fs: {
    readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
    rimraf: (targetPath: string) => Promise<boolean>;
    ensure: (dirPath: string) => Promise<boolean>;
    copy: (src: string, dest: string) => Promise<boolean>;
    writeFile: (
      filePath: string,
      data: string | Uint8Array,
      encoding?: BufferEncoding,
    ) => Promise<boolean>;
    pathExists: (targetPath: string) => Promise<boolean>;
    readdirWithTypes: (
      folderPath: string,
    ) => Promise<{ path: string; type: "file" | "folder" }[]>;
    archiveFiles: (
      filesToArchive: string[],
      zipPath: string,
    ) => Promise<boolean>;
    getTotalSizes: (filePaths: string[]) => Promise<number>;
    sha1: (filePath: string) => Promise<string>;
    move: (srcPath: string, destPath: string) => Promise<boolean>;
    readdir: (dirPath: string) => Promise<string[]>;
    extractZip: (zipPath: string, destination: string) => Promise<void>;
    rename: (oldPath: string, newPath: string) => Promise<boolean>;
    writeJSON: (filePath: string, data: any) => Promise<boolean>;
    readJSON: <T>(filePath: string, encoding?: BufferEncoding) => Promise<T>;
    isDirectory: (targetPath: string) => Promise<boolean>;
    getDirectories: (source: string) => Promise<string[]>;
  };
  clipboard: {
    writeText: (text: string) => Promise<boolean>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    openPath: (path: string) => Promise<void>;
  };
  file: {
    getFile: (filePath: string) => Promise<string>;
    archiveFiles: (
      filesToArchive: string[],
      zipPath: string,
    ) => Promise<boolean>;
    getTotalSizes: (filePaths: string[]) => Promise<number>;
    fromBuffer: (data: ArrayBuffer) => string;
    download(items: DownloadItem[], limit: number): Promise<void>;
  };
  servers: {
    write: (servers: IServer[], filePath: string) => Promise<boolean>;
    versions: (versions: IVersionConf[]) => Promise<
      {
        version: string;
        servers: any[];
        path: string;
      }[]
    >;
    get: (version: string, loader: Loader) => Promise<IServerOption[]>;
    read: (path: string) => Promise<IServer[]>;
    compare: (servers1: IServer[], servers2: IServer[]) => Promise<boolean>;
  };
  version: {
    import: (filePath: string, tempPath: string) => Promise<IImportModpack>;
    init: (versionConf: IVersionConf) => Promise<IVersionClassData>;
    install: (
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      extraItems?: DownloadItem[],
    ) => Promise<boolean>;
    getRunCommand: (
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      authData: IAuth | null,
      isRelative: boolean,
      quick?: { single?: string; multiplayer?: string },
    ) => Promise<string[] | null>;
    run: (
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      authData: IAuth | null,
      instance: number,
      quick: { single?: string; multiplayer?: string },
    ) => Promise<boolean>;
    delete: (
      account: ILocalAccount,
      versionConf: IVersionConf,
      isFull: boolean,
    ) => Promise<boolean>;
    save: (versionConf: IVersionConf) => Promise<boolean>;
    share: {
      uploadMods: (
        at: string,
        versionConf: IVersionConf,
      ) => Promise<{
        mods: ILocalProject[];
        success: boolean;
      }>;
    };
  };
  accounts: {
    save: (
      accounts: IAccountConf["accounts"],
      lastPlayed: string,
      launcherPath: string,
    ) => Promise<boolean>;
  };
  auth: {
    microsoft: (code: string) => Promise<IAuthResponse | null>;
    microsoftRefresh: (
      refreshToken: string,
      id: string,
    ) => Promise<IRefreshTokenResponse | null>;
    elyby: (code: string) => Promise<IAuthResponse | null>;
    elybyRefresh: (
      refreshToken: string,
      id: string,
    ) => Promise<IRefreshTokenResponse | null>;
    discord: (code: string) => Promise<IAuthResponse | null>;
    discordRefresh: (
      refreshToken: string,
      id: string,
    ) => Promise<IRefreshTokenResponse | null>;
    startServer: () => Promise<{
      code: string;
      provider: "microsoft" | "discord" | "elyby";
    }>;
  };
  backend: {
    getModpack: (
      at: string,
      code: string,
    ) => Promise<{
      status: "error" | "success" | "not_found";
      data: IModpack | null;
    }>;
    getOwnModpacks: (at: string) => Promise<IModpack[]>;
    shareModpack: (
      at: string,
      modpack: { conf: IModpack["conf"] },
    ) => Promise<string>;
    updateModpack: (
      at: string,
      shareCode: string,
      update: IModpackUpdate,
    ) => Promise<boolean>;
    deleteModpack: (at: string, shareCode: string) => Promise<boolean>;
    updateUser: (
      at: string,
      id: string,
      user: IUpdateUser,
    ) => Promise<IUser | null>;
    getUser: (at: string, id: string) => Promise<IUser | null>;
    uploadFileFromPath: (
      at: string,
      filePath: string,
      fileName?: string,
      folder?: string,
    ) => Promise<string | null>;
    deleteFile: (
      at: string,
      key: string,
      isDirectory?: boolean,
    ) => Promise<void>;
    modpackDownloaded: (at: string, shareCode: string) => Promise<void>;
    getNews: () => Promise<INews[]>;
    login: (
      at: string,
      id: string,
      auth: {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
      },
    ) => Promise<string | null>;
    getSkin: (at: string, uuid: string) => Promise<IGrubieSkin | null>;
    discordAuthenticated: (at: string, userId: string) => Promise<boolean>;
    aiComplete: (at: string, prompt: string) => Promise<string | null>;
    getAuthlib: () => Promise<IAuthlib | null>;
  };
  versions: {
    getList: (
      loader: "vanilla" | "forge" | "neoforge" | "fabric" | "quilt",
      includeSnapshots?: boolean,
    ) => Promise<IVersion[]>;
    getLoaderVersions: (
      loader: "forge" | "neoforge" | "fabric" | "quilt",
      versionId: string,
    ) => Promise<LoaderVersion[]>;
  };
  game: {
    runJar: (
      command: string,
      args: string[],
      cwd: string,
    ) => Promise<number | string>;
    installServer: (
      command: string,
      args: string[],
      serverPath: string,
    ) => Promise<string | number>;
    runGame: (
      versionName: string,
      instance: number,
      command: string,
      args: string[],
      cwd: string,
    ) => Promise<void>;
    closeGame: (versionName: string, instance: number) => Promise<void>;
  };
  java: {
    getPath: (majorVersion: number) => Promise<string>;
    install(majorVersion: number): Promise<string>;
  };
  mods: {
    check: (
      settings: TSettings,
      versionConf: IVersionConf,
      server?: IServerConf,
    ) => Promise<boolean>;
    downloadOther: (
      settings: TSettings,
      versionConf: IVersionConf,
    ) => Promise<boolean>;
  };
  other: {
    getVersion: () => Promise<string>;
    openFileDialog: (
      isFolder?: boolean,
      filters?: { name: string; extensions: string[] }[],
      multi?: boolean,
    ) => Promise<string[]>;
    getPaths: () => Promise<{
      launcher: string;
      minecraft: string;
      java: string;
      skins: string;
    }>;
    getPath: (
      pathKey:
        | "home"
        | "appData"
        | "userData"
        | "sessionData"
        | "temp"
        | "exe"
        | "module"
        | "desktop"
        | "documents"
        | "downloads"
        | "music"
        | "pictures"
        | "videos"
        | "recent"
        | "logs"
        | "crashDumps",
    ) => Promise<string>;
    notify: (options: Electron.NotificationConstructorOptions) => Promise<void>;
    getLocale: () => Promise<string>;
  };
  server: {
    install: (
      account: ILocalAccount | undefined,
      downloadLimit: number,
      versionPath: string,
      serverPath: string,
      conf: IServerConf,
      versionConf?: IVersionConf,
    ) => Promise<boolean>;
    getSettings: (filePath: string) => Promise<IServerSettings>;
    editXmx: (serverPath: string, memory: number) => Promise<void>;
    updateProperties: (
      filePath: string,
      settings: IServerSettings,
    ) => Promise<void>;
  };
  skins: {
    load: (
      launcherPath: string,
      platform: "microsoft" | "discord",
      userId: string,
      nickname: string,
      accessToken: string,
    ) => Promise<SkinsData>;
    selectSkin: (
      userId: string,
      platform: string,
      skinId: string | null,
    ) => Promise<SkinsData | null>;
    setCape: (
      userId: string,
      platform: string,
      capeId: string | undefined,
    ) => Promise<SkinsData | null>;
    changeModel: (
      userId: string,
      platform: string,
      model: "classic" | "slim",
    ) => Promise<SkinsData | null>;
    uploadSkin: (
      userId: string,
      platform: string,
      skinPath: string,
    ) => Promise<SkinsData | null>;
    deleteSkin: (
      userId: string,
      platform: string,
      skinId: string,
      type: "skin" | "cape",
    ) => Promise<SkinsData | null>;
    resetSkin: (userId: string, platform: string) => Promise<SkinsData | null>;
    importByUrl: (
      userId: string,
      platform: string,
      url: string,
      type: "skin" | "cape",
    ) => Promise<SkinsData | null>;
    importByFile: (
      userId: string,
      platform: string,
      filePath: string,
      type: "skin" | "cape",
    ) => Promise<SkinsData | null>;
    importByNickname: (
      userId: string,
      platform: string,
      nickname: string,
    ) => Promise<SkinsData | null>;
    renameSkin: (
      userId: string,
      platform: string,
      skinId: string,
      newName: string,
    ) => Promise<SkinsData | null>;
    clearManager: (userId: string, platform: string) => Promise<boolean>;
  };
  modManager: {
    search: (
      query: string,
      provider: Provider,
      options: {
        version: string | undefined;
        loader: Loader | ServerCore | undefined;
        projectType: ProjectType;
        sort: string;
        filter: string[];
      },
      pagination: {
        offset: number;
        limit: number;
      },
    ) => Promise<ISearchData>;
    getSort: (provider: Provider) => Promise<string[]>;
    getFilter: (
      provider: Provider,
      projectType: ProjectType,
    ) => Promise<IFilterGroup[]>;
    getProject: (
      provider: Provider,
      projectId: string,
    ) => Promise<IProject | null>;
    getVersions: (
      provider: Provider,
      projectId: string,
      options: {
        version?: string;
        loader?: Loader;
        projectType: ProjectType;
        modUrl: string;
      },
    ) => Promise<IVersionModManager[]>;
    getDependencies: (
      provider: Provider,
      projectId: string,
      deps: IVersionDependency[],
    ) => Promise<IVersionDependency[]>;
    checkLocalMod: (modPath: string) => Promise<ILocalFileInfo | null>;
    checkModpack: (
      modpackPath: string,
      pack?: IProject,
      selectVersion?: IVersionModManager,
    ) => Promise<IModpackModManager | null>;
    ptToFolder: (type: ProjectType) => Promise<string>;
    compareMods: (
      mods1: ILocalProject[],
      mods2: ILocalProject[],
    ) => Promise<boolean>;
  };
  worlds: {
    loadStatistics: (
      worldPath: string,
      account: ILocalAccount,
    ) => Promise<IWorldStatistics | undefined>;
    readWorld: (
      worldPath: string,
      account: ILocalAccount,
    ) => Promise<IWorld | null>;
    writeName: (worldPath: string, newName: string) => Promise<string | null>;
  };
  rpc: {
    updateActivity: (activity: DiscordRPC.Presence) => Promise<void>;
  };
  skin: {
    get: (
      type: string,
      uuid: string,
      nickname: string,
      accessToken?: string,
    ) => Promise<ISkinData | null>;
  };

  events: {
    onConsoleChangeStatus: (
      callback: (
        versionName: string,
        instance: number,
        status: "running" | "stopped" | "error",
      ) => void,
    ) => void;
    onConsoleMessage: (
      callback: (versionName: string, instance: number, message: any) => void,
    ) => void;
    onConsoleClear: (
      callback: (versionName: string, instance: number) => void,
    ) => void;
    onLaunch: (callback: () => void) => void;
    onFriendUpdate: (callback: (data: any) => void) => void;
    removeAllListeners: (channel: string) => void;
    onDownloaderInfo: (callback: (info: DownloaderInfo | null) => void) => void;
    updater: {
      onDownloadProgress: (callback: (progress: number) => void) => void;
    };
  };
}

export const api = {
  os: {
    totalmem: () => ipcRenderer.invoke("os:totalmem"),
  },
  path: {
    join: (...args: string[]) => ipcRenderer.invoke("path:join", ...args),
    basename: (filePath: string, suffix?: string) =>
      ipcRenderer.invoke("path:basename", filePath, suffix),
    extname: (filePath: string) => ipcRenderer.invoke("path:extname", filePath),
  },
  fs: {
    readFile: (filePath: string, encoding: BufferEncoding) =>
      ipcRenderer.invoke("fs:readFile", filePath, encoding),
    rimraf: (targetPath: string) => ipcRenderer.invoke("fs:rimraf", targetPath),
    ensure: (dirPath: string) => ipcRenderer.invoke("fs:ensure", dirPath),
    copy: (src: string, dest: string) =>
      ipcRenderer.invoke("fs:copy", src, dest),
    writeFile: (
      filePath: string,
      data: string | Uint8Array,
      encoding: BufferEncoding = "utf-8",
    ) => ipcRenderer.invoke("fs:writeFile", filePath, data, encoding),
    pathExists: (targetPath: string) =>
      ipcRenderer.invoke("fs:pathExists", targetPath),
    readdirWithTypes: (folderPath: string) =>
      ipcRenderer.invoke("fs:readdirWithTypes", folderPath),
    sha1: (filePath: string) => ipcRenderer.invoke("fs:sha1", filePath),
    move: (srcPath: string, destPath: string) =>
      ipcRenderer.invoke("fs:move", srcPath, destPath),
    readdir: (dirPath: string) => ipcRenderer.invoke("fs:readdir", dirPath),
    extractZip: (zipPath: string, destination: string) =>
      ipcRenderer.invoke("fs:extractZip", zipPath, destination),
    rename: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke("fs:rename", oldPath, newPath),
    writeJSON: (filePath: string, data: any) =>
      ipcRenderer.invoke("fs:writeJSON", filePath, data),
    readJSON: <_>(filePath: string, encoding?: BufferEncoding) =>
      ipcRenderer.invoke("fs:readJSON", filePath, encoding),
    isDirectory: (targetPath: string) =>
      ipcRenderer.invoke("fs:isDirectory", targetPath),
    getDirectories: (source: string) =>
      ipcRenderer.invoke("fs:getDirectories", source),
  },
  clipboard: {
    writeText: (text: string) =>
      ipcRenderer.invoke("clipboard:writeText", text),
  },
  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke("shell:openExternal", url),
    openPath: (path: string) => ipcRenderer.invoke("shell:openPath", path),
  },
  file: {
    archiveFiles: (filesToArchive: string[], zipPath: string) =>
      ipcRenderer.invoke("file:archiveFiles", filesToArchive, zipPath),
    getTotalSizes: (filePaths: string[]) =>
      ipcRenderer.invoke("file:getTotalSizes", filePaths),
    getFile: (filePath: string) => ipcRenderer.invoke("file:getFile", filePath),
    fromBuffer: (data: ArrayBuffer) =>
      ipcRenderer.invoke("file:fromBuffer", data),
    download: (items: DownloadItem[], limit: number) =>
      ipcRenderer.invoke("file:download", items, limit),
  },
  servers: {
    write: (servers: IServer[], filePath: string) =>
      ipcRenderer.invoke("servers:write", servers, filePath),
    versions: (versions: IVersionConf[]) =>
      ipcRenderer.invoke("servers:versions", versions),
    get: (version: string, loader: Loader) =>
      ipcRenderer.invoke("servers:get", version, loader),
    read: (path: string) => ipcRenderer.invoke("servers:read", path),
    compare: (servers1: IServer[], servers2: IServer[]) =>
      ipcRenderer.invoke("servers:compare", servers1, servers2),
  },
  version: {
    import: (filePath: string, tempPath: string) =>
      ipcRenderer.invoke("version:import", filePath, tempPath),
    init: (versionConf: IVersionConf) =>
      ipcRenderer.invoke("version:init", versionConf),
    install: (
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      extraItems?: DownloadItem[],
    ) =>
      ipcRenderer.invoke(
        "version:install",
        account,
        settings,
        versionConf,
        extraItems,
      ),
    getRunCommand: (
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      authData: IAuth | null,
      isRelative: boolean,
      quick?: { single?: string; multiplayer?: string },
    ) =>
      ipcRenderer.invoke(
        "version:getRunCommand",
        account,
        settings,
        versionConf,
        authData,
        isRelative,
        quick,
      ),
    run: (
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      authData: IAuth | null,
      instance: number,
      quick: { single?: string; multiplayer?: string },
    ) =>
      ipcRenderer.invoke(
        "version:run",
        account,
        settings,
        versionConf,
        authData,
        instance,
        quick,
      ),
    delete: (
      account: ILocalAccount,
      versionConf: IVersionConf,
      isFull: boolean,
    ) => ipcRenderer.invoke("version:delete", account, versionConf, isFull),
    save: (versionConf: IVersionConf) =>
      ipcRenderer.invoke("version:save", versionConf),
    share: {
      uploadMods: (at: string, versionConf: IVersionConf) =>
        ipcRenderer.invoke("share:uploadMods", at, versionConf),
    },
  },
  accounts: {
    save: (
      accounts: IAccountConf["accounts"],
      lastPlayed: string,
      launcherPath: string,
    ) =>
      ipcRenderer.invoke("accounts:save", accounts, lastPlayed, launcherPath),
  },
  auth: {
    microsoft: (code: string) => ipcRenderer.invoke("auth:microsoft", code),
    microsoftRefresh: (refreshToken: string, id: string) =>
      ipcRenderer.invoke("auth:microsoft:refresh", refreshToken, id),
    elyby: (code: string) => ipcRenderer.invoke("auth:elyby", code),
    elybyRefresh: (refreshToken: string, id: string) =>
      ipcRenderer.invoke("auth:elyby:refresh", refreshToken, id),
    discord: (code: string) => ipcRenderer.invoke("auth:discord", code),
    discordRefresh: (refreshToken: string, id: string) =>
      ipcRenderer.invoke("auth:discord:refresh", refreshToken, id),
    startServer: () => ipcRenderer.invoke("auth:startServer"),
  },
  backend: {
    getModpack: (at: string, code: string) =>
      ipcRenderer.invoke("backend:getModpack", at, code),
    getOwnModpacks: (at: string) =>
      ipcRenderer.invoke("backend:getOwnModpacks", at),
    shareModpack: (at: string, modpack: { conf: IModpack["conf"] }) =>
      ipcRenderer.invoke("backend:shareModpack", at, modpack),
    updateModpack: (at: string, shareCode: string, update: IModpackUpdate) =>
      ipcRenderer.invoke("backend:updateModpack", at, shareCode, update),
    deleteModpack: (at: string, shareCode: string) =>
      ipcRenderer.invoke("backend:deleteModpack", at, shareCode),
    updateUser: (at: string, id: string, user: IUpdateUser) =>
      ipcRenderer.invoke("backend:updateUser", at, id, user),
    getUser: (at: string, id: string) =>
      ipcRenderer.invoke("backend:getUser", at, id),
    uploadFileFromPath: (
      at: string,
      filePath: string,
      fileName?: string,
      folder?: string,
    ) =>
      ipcRenderer.invoke(
        "backend:uploadFileFromPath",
        at,
        filePath,
        fileName,
        folder,
      ),
    deleteFile: (at: string, key: string, isDirectory?: boolean) =>
      ipcRenderer.invoke("backend:deleteFile", at, key, isDirectory),
    modpackDownloaded: (at: string, shareCode: string) =>
      ipcRenderer.invoke("backend:modpackDownloaded", at, shareCode),
    getNews: () => ipcRenderer.invoke("backend:getNews"),
    login: (
      id: string,
      auth: { accessToken: string; refreshToken: string; expiresAt: number },
    ) => ipcRenderer.invoke("backend:login", id, auth),
    getSkin: (at: string, uuid: string) =>
      ipcRenderer.invoke("backend:getSkin", at, uuid),
    discordAuthenticated: (at: string, userId: string) =>
      ipcRenderer.invoke("backend:discordAuthenticated", at, userId),
    aiComplete: (at: string, prompt: string) =>
      ipcRenderer.invoke("backend:aiComplete", at, prompt),
    getAuthlib: () => ipcRenderer.invoke("backend:getAuthlib"),
  },
  versions: {
    getList: (
      loader: "vanilla" | "forge" | "neoforge" | "fabric" | "quilt",
      includeSnapshots: boolean = false,
    ) => ipcRenderer.invoke("versions:getList", loader, includeSnapshots),
    getLoaderVersions: (
      loader: "forge" | "neoforge" | "fabric" | "quilt",
      versionId: string,
    ) => ipcRenderer.invoke("versions:getLoaderVersions", loader, versionId),
  },
  game: {
    runJar: (command: string, args: string[], cwd: string) =>
      ipcRenderer.invoke("game:runJar", command, args, cwd),
    installServer: (command: string, args: string[], serverPath: string) =>
      ipcRenderer.invoke("game:installServer", command, args, serverPath),
    runGame: (
      versionName: string,
      instance: number,
      command: string,
      args: string[],
      cwd: string,
    ) =>
      ipcRenderer.invoke(
        "game:runGame",
        versionName,
        instance,
        command,
        args,
        cwd,
      ),
    closeGame: (versionName: string, instance: number) =>
      ipcRenderer.invoke("game:closeGame", versionName, instance),
  },
  java: {
    getPath: (majorVersion: number) =>
      ipcRenderer.invoke("java:getPath", majorVersion),
    install: (majorVersion: number) =>
      ipcRenderer.invoke("java:install", majorVersion),
  },
  mods: {
    check: (
      settings: TSettings,
      versionConf: IVersionConf,
      server?: IServerConf,
    ) => ipcRenderer.invoke("mods:check", settings, versionConf, server),
    downloadOther: (settings: TSettings, versionConf: IVersionConf) =>
      ipcRenderer.invoke("mods:downloadOther", settings, versionConf),
  },
  other: {
    getVersion: () => ipcRenderer.invoke("other:getVersion"),
    openFileDialog: (
      isFolder?: boolean,
      filters?: { name: string; extensions: string[] }[],
      multi?: boolean,
    ) => ipcRenderer.invoke("other:openFileDialog", isFolder, filters, multi),
    getPaths: () => ipcRenderer.invoke("other:getPaths"),
    getPath: (pathKey: string) => ipcRenderer.invoke("other:getPath", pathKey),
    notify: (options: Electron.NotificationConstructorOptions) =>
      ipcRenderer.invoke("other:notify", options),
    getLocale: () => ipcRenderer.invoke("other:getLocale"),
  },
  server: {
    install: (
      account: ILocalAccount | undefined,
      downloadLimit: number,
      versionPath: string,
      serverPath: string,
      conf: IServerConf,
      versionConf?: IVersionConf,
    ) =>
      ipcRenderer.invoke(
        "server:install",
        account,
        downloadLimit,
        versionPath,
        serverPath,
        conf,
        versionConf,
      ),
    getSettings: (filePath: string) =>
      ipcRenderer.invoke("server:getSettings", filePath),
    editXmx: (serverPath: string, memory: number) =>
      ipcRenderer.invoke("server:editXmx", serverPath, memory),
    updateProperties: (filePath: string, settings: IServerSettings) =>
      ipcRenderer.invoke("server:updateProperties", filePath, settings),
  },
  skins: {
    load: (
      launcherPath: string,
      platform: "microsoft" | "discord",
      userId: string,
      nickname: string,
      accessToken: string,
    ) =>
      ipcRenderer.invoke(
        "skins:load",
        launcherPath,
        platform,
        userId,
        nickname,
        accessToken,
      ),
    selectSkin: (userId: string, platform: string, skinId: string | null) =>
      ipcRenderer.invoke("skins:selectSkin", userId, platform, skinId),
    setCape: (userId: string, platform: string, capeId: string | undefined) =>
      ipcRenderer.invoke("skins:setCape", userId, platform, capeId),
    changeModel: (
      userId: string,
      platform: string,
      model: "classic" | "slim",
    ) => ipcRenderer.invoke("skins:changeModel", userId, platform, model),
    uploadSkin: (userId: string, platform: string, skinPath: string) =>
      ipcRenderer.invoke("skins:uploadSkin", userId, platform, skinPath),
    deleteSkin: (
      userId: string,
      platform: string,
      skinId: string,
      type: "skin" | "cape",
    ) => ipcRenderer.invoke("skins:deleteSkin", userId, platform, skinId, type),
    resetSkin: (userId: string, platform: string) =>
      ipcRenderer.invoke("skins:resetSkin", userId, platform),
    importByUrl: (
      userId: string,
      platform: string,
      url: string,
      type: "skin" | "cape",
    ) => ipcRenderer.invoke("skins:importByUrl", userId, platform, url, type),
    importByFile: (
      userId: string,
      platform: string,
      filePath: string,
      type: "skin" | "cape",
    ) =>
      ipcRenderer.invoke(
        "skins:importByFile",
        userId,
        platform,
        filePath,
        type,
      ),
    importByNickname: (userId: string, platform: string, nickname: string) =>
      ipcRenderer.invoke("skins:importByNickname", userId, platform, nickname),
    renameSkin: (
      userId: string,
      platform: string,
      skinId: string,
      newName: string,
    ) =>
      ipcRenderer.invoke("skins:renameSkin", userId, platform, skinId, newName),
    clearManager: (userId: string, platform: string) =>
      ipcRenderer.invoke("skins:clearManager", userId, platform),
  },
  modManager: {
    search: (
      query: string,
      provider: Provider,
      options: any,
      pagination: any,
    ) =>
      ipcRenderer.invoke(
        "modManager:search",
        query,
        provider,
        options,
        pagination,
      ),
    getSort: (provider: any) =>
      ipcRenderer.invoke("modManager:getSort", provider),
    getFilter: (provider: Provider, projectType: ProjectType) =>
      ipcRenderer.invoke("modManager:getFilter", provider, projectType),
    getProject: (provider: Provider, projectId: string) =>
      ipcRenderer.invoke("modManager:getProject", provider, projectId),
    getVersions: (provider: Provider, projectId: string, options: any) =>
      ipcRenderer.invoke(
        "modManager:getVersions",
        provider,
        projectId,
        options,
      ),
    getDependencies: (provider: Provider, projectId: string, deps: any[]) =>
      ipcRenderer.invoke(
        "modManager:getDependencies",
        provider,
        projectId,
        deps,
      ),
    checkLocalMod: (modPath: string) =>
      ipcRenderer.invoke("modManager:checkLocalMod", modPath),
    checkModpack: (
      modpackPath: string,
      pack?: any,
      selectVersion?: IVersionModManager,
    ) =>
      ipcRenderer.invoke(
        "modManager:checkModpack",
        modpackPath,
        pack,
        selectVersion,
      ),
    ptToFolder: (type: ProjectType) =>
      ipcRenderer.invoke("modManager:ptToFolder", type),
    compareMods: (mods1: ILocalProject[], mods2: ILocalProject[]) =>
      ipcRenderer.invoke("modManager:compareMods", mods1, mods2),
  },
  worlds: {
    loadStatistics: (worldPath: string, account: ILocalAccount) =>
      ipcRenderer.invoke("worlds:loadStatistics", worldPath, account),
    readWorld: (worldPath: string, account: ILocalAccount) =>
      ipcRenderer.invoke("worlds:readWorld", worldPath, account),
    writeName: (worldPath: string, newName: string) =>
      ipcRenderer.invoke("worlds:writeName", worldPath, newName),
  },
  rpc: {
    updateActivity: (activity: any) =>
      ipcRenderer.invoke("rpc:updateActivity", activity),
  },
  skin: {
    get: (type: string, uuid: string, nickname: string, accessToken?: string) =>
      ipcRenderer.invoke("skin:get", type, uuid, nickname, accessToken),
  },
  events: {
    onConsoleChangeStatus: (
      callback: (
        versionName: string,
        instance: number,
        status: "running" | "stopped" | "error",
      ) => void,
    ) => {
      ipcRenderer.on(
        "consoleChangeStatus",
        (_event, versionName, instance, status) => {
          callback(versionName, instance, status);
        },
      );
    },

    onConsoleMessage: (
      callback: (versionName: string, instance: number, message: any) => void,
    ) => {
      ipcRenderer.on(
        "consoleMessage",
        (_event, versionName, instance, message) => {
          callback(versionName, instance, message);
        },
      );
    },

    onConsoleClear: (
      callback: (versionName: string, instance: number) => void,
    ) => {
      ipcRenderer.on("consoleClear", (_event, versionName, instance) => {
        callback(versionName, instance);
      });
    },

    onLaunch: (callback: () => void) => {
      ipcRenderer.on("launch", () => {
        callback();
      });
    },

    onFriendUpdate: (callback: (data: any) => void) => {
      ipcRenderer.on("friendUpdate", (_event, data) => {
        callback(data);
      });
    },

    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },

    onDownloaderInfo: (callback: (info: DownloaderInfo | null) => void) => {
      ipcRenderer.on("downloaderInfo", (_event, info) => {
        callback(info);
      });
    },

    updater: {
      onDownloadProgress: (callback: (progress: number) => void) => {
        ipcRenderer.on("updater:downloadProgress", (_event, progress) => {
          callback(progress);
        });
      },
    },
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.

export const electron = {
  ipcRenderer,
  process: {
    arch: process.arch,
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electron);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(`Error exposing electron api to main world: ${error}`);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electron;
  // @ts-ignore (define in dts)
  window.api = api;
}
