import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IServer } from "@/types/ServersList";
import {
  IImportModpack,
  IVersion,
  IVersionClassData,
  IVersionConf,
} from "@/types/IVersion";
import { IAccountConf, IAuth, ILocalAccount } from "@/types/Account";
import { IModpack, IModpackUpdate, UploadFileProgress } from "@/types/Backend";
import { IFriendSettingsUpdate, IUpdateUser, IUser } from "@/types/IUser";
import { INews, ISponsoredNewsAd } from "@/types/News";
import { IGrubieSkin, SkinsData } from "@/types/SkinManager";
import { LoaderVersion } from "@/types/VersionsService";
import { TSettings } from "@/types/Settings";
import {
  IServerConf,
  IServerOption,
  IServerSettings,
  ServerCore,
} from "@/types/Server";
import {
  DownloaderFailuresInfo,
  DownloaderInfo,
  DownloadItem,
} from "@/types/Downloader";
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
import { ISkinData } from "@/types/Skin";
import {
  IWorld,
  IWorldStatistics,
  IWorldStatsAggregate,
} from "@/types/World";
import { IAchievementStats } from "@/types/Achievements";
import { IAuthlib, AuthlibEnsureResult } from "@/types/IAuthlib";
import { IAuthResponse, IRefreshTokenResponse } from "@/types/Auth";
import {
  ActiveFriendShare,
  ResolvedFriendShareConnection,
  ShareCommandResult,
  SharePeerInfo,
  ShareState,
  ShareStateError,
  ShareVisibility,
} from "@/types/Share";
import { RpcRendererContext } from "@/types/Rpc";
import {
  VersionInstallOptions,
  VersionInstallProgress,
  VersionInstallResult,
} from "@/types/InstallationProgress";
import { NotificationClickAction } from "@/types/Notification";
import { LauncherDeepLink } from "@/types/DeepLink";
import { ConnectivityCheckResult } from "@/types/Connectivity";
import { CrashAnalysisPayload } from "@/types/CrashAnalysis";
import { ILauncherReleaseNote } from "@/types/LauncherRelease";
import { IPlaytimeSyncEntry } from "@/types/VersionStatistics";

export type UpdaterStatus =
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

export interface UpdaterProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdaterStatusPayload {
  status: UpdaterStatus;
  version?: string;
  message?: string;
}

const pendingDeepLinks: LauncherDeepLink[] = [];
const deepLinkSubscribers = new Set<(payload: LauncherDeepLink) => void>();

ipcRenderer.on(
  "app:deepLink",
  (_event: Electron.IpcRendererEvent, payload: LauncherDeepLink) => {
    if (deepLinkSubscribers.size === 0) {
      pendingDeepLinks.push(payload);
      return;
    }

    deepLinkSubscribers.forEach((callback) => callback(payload));
  },
);

export interface IElectronAPI {
  platform: string;
  window: {
    minimize: () => Promise<void>;
    maximizeToggle: () => Promise<void>;
    close: () => Promise<void>;
  };
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
      basePath?: string,
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
      basePath?: string,
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
      options?: VersionInstallOptions,
    ) => Promise<VersionInstallResult>;
    cancelInstall: () => Promise<boolean>;
    pauseInstall: () => Promise<boolean>;
    resumeInstall: () => Promise<boolean>;
    ensureAuthlib: (
      account: ILocalAccount,
      versionConf: IVersionConf,
    ) => Promise<AuthlibEnsureResult>;
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
        uploaded: number;
      }>;
    };
  };
  accounts: {
    load: () => Promise<IAccountConf>;
    save: (
      accounts: IAccountConf["accounts"],
      lastPlayed: string | null,
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
    startServer: (expectedState: string) => Promise<{
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
      modpack: { conf: IModpack["conf"]; isPublic?: boolean },
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
    resetFriendCode: (at: string, id: string) => Promise<IUser | null>;
    updateFriendSettings: (
      at: string,
      id: string,
      settings: IFriendSettingsUpdate,
    ) => Promise<IUser | null>;
    uploadFileFromPath: (
      at: string,
      filePath: string,
      fileName?: string,
      folder?: string,
      progressId?: string,
      direct?: boolean,
    ) => Promise<string | null>;
    onUploadFileProgress: (
      callback: (progress: UploadFileProgress) => void,
    ) => () => void;
    deleteFile: (
      at: string,
      key: string,
      isDirectory?: boolean,
    ) => Promise<void>;
    modpackDownloaded: (at: string, shareCode: string) => Promise<boolean>;
    getNews: () => Promise<INews[]>;
    getWhatsNew: (
      version: string,
      locale: string,
    ) => Promise<ILauncherReleaseNote | null>;
    getSponsoredNewsAd: (
      locale: string,
      hiddenIds: string[],
    ) => Promise<ISponsoredNewsAd | null>;
    recordSponsoredAdImpression: (id: string) => Promise<boolean>;
    recordSponsoredAdClick: (id: string) => Promise<boolean>;
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
      options?: VersionInstallOptions,
    ) => Promise<VersionInstallResult>;
    downloadOther: (
      settings: TSettings,
      versionConf: IVersionConf,
      options?: VersionInstallOptions,
    ) => Promise<VersionInstallResult>;
    cancelInstall: () => Promise<boolean>;
  };
  other: {
    getVersion: () => Promise<string>;
    openFileDialog: (
      isFolder?: boolean,
      filters?: { name: string; extensions: string[] }[],
      multi?: boolean,
    ) => Promise<string[]>;
    getPathForFile: (file: File) => string;
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
    notify: (
      options: Electron.NotificationConstructorOptions,
      clickAction?: NotificationClickAction,
    ) => Promise<void>;
    getLocale: () => Promise<string>;
    restoreWindow: () => Promise<void>;
    onNotificationClick: (
      callback: (action: NotificationClickAction) => void,
    ) => () => void;
  };
  connectivity: {
    test: () => Promise<ConnectivityCheckResult[]>;
    onResult: (
      callback: (result: ConnectivityCheckResult) => void,
    ) => () => void;
  };
  server: {
    install: (
      account: ILocalAccount | undefined,
      downloadLimit: number,
      versionPath: string,
      serverPath: string,
      conf: IServerConf,
      versionConf?: IVersionConf,
    ) => Promise<{ success: boolean; error?: string }>;
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
    loadVersionStatistics: (
      versionPath: string,
      account: ILocalAccount,
    ) => Promise<IWorldStatsAggregate>;
    loadAchievementStats: (
      account: ILocalAccount,
    ) => Promise<IAchievementStats>;
    readWorld: (
      worldPath: string,
      account: ILocalAccount,
    ) => Promise<IWorld | null>;
    writeName: (worldPath: string, newName: string) => Promise<string | null>;
  };
  statistics: {
    getSyncQueue: () => Promise<IPlaytimeSyncEntry[]>;
    resolveSyncEntries: (ids: string[]) => Promise<boolean>;
  };
  rpc: {
    syncContext: (context: RpcRendererContext) => Promise<void>;
  };
  skin: {
    get: (
      type: string,
      uuid: string,
      nickname: string,
      accessToken?: string,
    ) => Promise<ISkinData | null>;
  };
  share: {
    startShare: (
      visibility: ShareVisibility,
    ) => Promise<ShareCommandResult<ShareState>>;
    stopShare: () => Promise<ShareCommandResult<ShareState>>;
    updateShareVisibility: (
      visibility: ShareVisibility,
    ) => Promise<ShareCommandResult<ShareState>>;
    getShareState: () => Promise<ShareState>;
    getSharePeers: () => Promise<SharePeerInfo[]>;
    fetchActiveFriendShares: () => Promise<
      ShareCommandResult<ActiveFriendShare[]>
    >;
    requestJoinTicket: (
      slug: string,
    ) => Promise<ShareCommandResult<ResolvedFriendShareConnection>>;
    connectToFriendShare: (
      slug: string,
    ) => Promise<ShareCommandResult<ResolvedFriendShareConnection>>;
    onShareStateChanged: (callback: (state: ShareState) => void) => () => void;
    onShareError: (callback: (error: ShareStateError) => void) => () => void;
    onSharePeersChanged: (
      callback: (peers: SharePeerInfo[]) => void,
    ) => () => void;
  };
  events: {
    onConsoleChangeStatus: (
      callback: (
        versionName: string,
        instance: number,
        status: "running" | "stopped" | "error",
      ) => void,
    ) => () => void;
    onConsoleMessage: (
      callback: (versionName: string, instance: number, message: any) => void,
    ) => () => void;
    onConsoleClear: (
      callback: (versionName: string, instance: number) => void,
    ) => () => void;
    onLaunch: (callback: () => void) => () => void;
    onUpdateFailed: (
      callback: (payload: { message: string }) => void,
    ) => () => void;
    onCrashAnalysis: (
      callback: (
        versionName: string,
        instance: number,
        analysis: CrashAnalysisPayload,
      ) => void,
    ) => () => void;
    onFriendUpdate: (callback: (data: any) => void) => () => void;
    onPlaytimeRecorded: (callback: () => void) => () => void;
    removeAllListeners: (channel: string) => void;
    onDownloaderInfo: (
      callback: (info: DownloaderInfo | null) => void,
    ) => () => void;
    onDownloaderFailures: (
      callback: (info: DownloaderFailuresInfo) => void,
    ) => () => void;
    onVersionInstallProgress: (
      callback: (info: VersionInstallProgress | null) => void,
    ) => () => void;
    onDeepLink: (callback: (payload: LauncherDeepLink) => void) => () => void;
    updater: {
      onStatus: (
        callback: (payload: UpdaterStatusPayload) => void,
      ) => () => void;
      onDownloadProgress: (
        callback: (progress: UpdaterProgress) => void,
      ) => () => void;
    };
  };
}

export const api = {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximizeToggle: () => ipcRenderer.invoke("window:maximizeToggle"),
    close: () => ipcRenderer.invoke("window:close"),
  },
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
    archiveFiles: (
      filesToArchive: string[],
      zipPath: string,
      basePath?: string,
    ) =>
      ipcRenderer.invoke(
        "file:archiveFiles",
        filesToArchive,
        zipPath,
        basePath,
      ),
    getTotalSizes: (filePaths: string[]) =>
      ipcRenderer.invoke("file:getTotalSizes", filePaths),
    getFile: (filePath: string) => ipcRenderer.invoke("file:getFile", filePath),
    fromBuffer: (data: ArrayBuffer) => Buffer.from(data).toString("binary"),
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
      options?: VersionInstallOptions,
    ) =>
      ipcRenderer.invoke(
        "version:install",
        account,
        settings,
        versionConf,
        extraItems,
        options,
      ),
    cancelInstall: () => ipcRenderer.invoke("version:cancelInstall"),
    pauseInstall: () => ipcRenderer.invoke("version:pauseInstall"),
    resumeInstall: () => ipcRenderer.invoke("version:resumeInstall"),
    ensureAuthlib: (account: ILocalAccount, versionConf: IVersionConf) =>
      ipcRenderer.invoke("version:ensureAuthlib", account, versionConf),
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
    load: () => ipcRenderer.invoke("accounts:load"),
    save: (accounts: IAccountConf["accounts"], lastPlayed: string | null) =>
      ipcRenderer.invoke("accounts:save", accounts, lastPlayed),
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
    startServer: (expectedState: string) =>
      ipcRenderer.invoke("auth:startServer", expectedState),
  },
  backend: {
    getModpack: (at: string, code: string) =>
      ipcRenderer.invoke("backend:getModpack", at, code),
    getOwnModpacks: (at: string) =>
      ipcRenderer.invoke("backend:getOwnModpacks", at),
    shareModpack: (
      at: string,
      modpack: { conf: IModpack["conf"]; isPublic?: boolean },
    ) => ipcRenderer.invoke("backend:shareModpack", at, modpack),
    updateModpack: (at: string, shareCode: string, update: IModpackUpdate) =>
      ipcRenderer.invoke("backend:updateModpack", at, shareCode, update),
    deleteModpack: (at: string, shareCode: string) =>
      ipcRenderer.invoke("backend:deleteModpack", at, shareCode),
    updateUser: (at: string, id: string, user: IUpdateUser) =>
      ipcRenderer.invoke("backend:updateUser", at, id, user),
    getUser: (at: string, id: string) =>
      ipcRenderer.invoke("backend:getUser", at, id),
    resetFriendCode: (at: string, id: string) =>
      ipcRenderer.invoke("backend:resetFriendCode", at, id),
    updateFriendSettings: (
      at: string,
      id: string,
      settings: IFriendSettingsUpdate,
    ) => ipcRenderer.invoke("backend:updateFriendSettings", at, id, settings),
    uploadFileFromPath: (
      at: string,
      filePath: string,
      fileName?: string,
      folder?: string,
      progressId?: string,
      direct?: boolean,
    ) =>
      ipcRenderer.invoke(
        "backend:uploadFileFromPath",
        at,
        filePath,
        fileName,
        folder,
        progressId,
        direct,
      ),
    onUploadFileProgress: (callback: (progress: UploadFileProgress) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        progress: UploadFileProgress,
      ) => {
        callback(progress);
      };
      ipcRenderer.on("backend:uploadFileProgress", listener);
      return () => ipcRenderer.off("backend:uploadFileProgress", listener);
    },
    deleteFile: (at: string, key: string, isDirectory?: boolean) =>
      ipcRenderer.invoke("backend:deleteFile", at, key, isDirectory),
    modpackDownloaded: (at: string, shareCode: string) =>
      ipcRenderer.invoke("backend:modpackDownloaded", at, shareCode),
    getNews: () => ipcRenderer.invoke("backend:getNews"),
    getWhatsNew: (version: string, locale: string) =>
      ipcRenderer.invoke("backend:getWhatsNew", version, locale),
    getSponsoredNewsAd: (locale: string, hiddenIds: string[]) =>
      ipcRenderer.invoke("backend:getSponsoredNewsAd", locale, hiddenIds),
    recordSponsoredAdImpression: (id: string) =>
      ipcRenderer.invoke("backend:recordSponsoredAdImpression", id),
    recordSponsoredAdClick: (id: string) =>
      ipcRenderer.invoke("backend:recordSponsoredAdClick", id),
    login: (
      at: string,
      id: string,
      auth: { accessToken: string; refreshToken: string; expiresAt: number },
    ) => ipcRenderer.invoke("backend:login", at, id, auth),
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
      options?: VersionInstallOptions,
    ) =>
      ipcRenderer.invoke("mods:check", settings, versionConf, server, options),
    downloadOther: (
      settings: TSettings,
      versionConf: IVersionConf,
      options?: VersionInstallOptions,
    ) =>
      ipcRenderer.invoke("mods:downloadOther", settings, versionConf, options),
    cancelInstall: () => ipcRenderer.invoke("mods:cancelInstall"),
  },
  other: {
    getVersion: () => ipcRenderer.invoke("other:getVersion"),
    openFileDialog: (
      isFolder?: boolean,
      filters?: { name: string; extensions: string[] }[],
      multi?: boolean,
    ) => ipcRenderer.invoke("other:openFileDialog", isFolder, filters, multi),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    getPaths: () => ipcRenderer.invoke("other:getPaths"),
    getPath: (pathKey: string) => ipcRenderer.invoke("other:getPath", pathKey),
    notify: (
      options: Electron.NotificationConstructorOptions,
      clickAction?: NotificationClickAction,
    ) => ipcRenderer.invoke("other:notify", options, clickAction),
    getLocale: () => ipcRenderer.invoke("other:getLocale"),
    restoreWindow: () => ipcRenderer.invoke("other:restoreWindow"),
    onNotificationClick: (
      callback: (action: NotificationClickAction) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        action: NotificationClickAction,
      ) => callback(action);
      ipcRenderer.on("other:notificationClick", listener);
      return () => ipcRenderer.off("other:notificationClick", listener);
    },
  },
  connectivity: {
    test: () => ipcRenderer.invoke("connectivity:test"),
    onResult: (callback: (result: ConnectivityCheckResult) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        result: ConnectivityCheckResult,
      ) => callback(result);
      ipcRenderer.on("connectivity:result", listener);
      return () => ipcRenderer.off("connectivity:result", listener);
    },
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
    loadVersionStatistics: (versionPath: string, account: ILocalAccount) =>
      ipcRenderer.invoke("worlds:loadVersionStatistics", versionPath, account),
    loadAchievementStats: (account: ILocalAccount) =>
      ipcRenderer.invoke("worlds:loadAchievementStats", account),
    readWorld: (worldPath: string, account: ILocalAccount) =>
      ipcRenderer.invoke("worlds:readWorld", worldPath, account),
    writeName: (worldPath: string, newName: string) =>
      ipcRenderer.invoke("worlds:writeName", worldPath, newName),
  },
  statistics: {
    getSyncQueue: () => ipcRenderer.invoke("statistics:getSyncQueue"),
    resolveSyncEntries: (ids: string[]) =>
      ipcRenderer.invoke("statistics:resolveSyncEntries", ids),
  },
  rpc: {
    syncContext: (context: RpcRendererContext) =>
      ipcRenderer.invoke("rpc:syncContext", context),
  },
  skin: {
    get: (type: string, uuid: string, nickname: string, accessToken?: string) =>
      ipcRenderer.invoke("skin:get", type, uuid, nickname, accessToken),
  },
  share: {
    startShare: (visibility: ShareVisibility) =>
      ipcRenderer.invoke("share:start", visibility),
    stopShare: () => ipcRenderer.invoke("share:stop"),
    updateShareVisibility: (visibility: ShareVisibility) =>
      ipcRenderer.invoke("share:updateVisibility", visibility),
    getShareState: () => ipcRenderer.invoke("share:getState"),
    getSharePeers: () => ipcRenderer.invoke("share:getPeers"),
    fetchActiveFriendShares: () =>
      ipcRenderer.invoke("share:fetchActiveFriendShares"),
    requestJoinTicket: (slug: string) =>
      ipcRenderer.invoke("share:requestJoinTicket", slug),
    connectToFriendShare: (slug: string) =>
      ipcRenderer.invoke("share:connectToFriendShare", slug),
    onShareStateChanged: (callback: (state: ShareState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: ShareState) =>
        callback(state);
      ipcRenderer.on("share:stateChanged", listener);
      return () => ipcRenderer.off("share:stateChanged", listener);
    },
    onShareError: (callback: (error: ShareStateError) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        error: ShareStateError,
      ) => callback(error);
      ipcRenderer.on("share:error", listener);
      return () => ipcRenderer.off("share:error", listener);
    },
    onSharePeersChanged: (callback: (peers: SharePeerInfo[]) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        peers: SharePeerInfo[],
      ) => callback(peers);
      ipcRenderer.on("share:peersChanged", listener);
      return () => ipcRenderer.off("share:peersChanged", listener);
    },
  },
  events: {
    onConsoleChangeStatus: (
      callback: (
        versionName: string,
        instance: number,
        status: "running" | "stopped" | "error",
      ) => void,
    ) => {
      const listener = (_event, versionName, instance, status) => {
        callback(versionName, instance, status);
      };
      ipcRenderer.on("consoleChangeStatus", listener);
      return () => ipcRenderer.off("consoleChangeStatus", listener);
    },

    onConsoleMessage: (
      callback: (versionName: string, instance: number, message: any) => void,
    ) => {
      const listener = (_event, versionName, instance, message) => {
        callback(versionName, instance, message);
      };
      ipcRenderer.on("consoleMessage", listener);
      return () => ipcRenderer.off("consoleMessage", listener);
    },

    onConsoleClear: (
      callback: (versionName: string, instance: number) => void,
    ) => {
      const listener = (_event, versionName, instance) => {
        callback(versionName, instance);
      };
      ipcRenderer.on("consoleClear", listener);
      return () => ipcRenderer.off("consoleClear", listener);
    },

    onLaunch: (callback: () => void) => {
      const listener = () => {
        callback();
      };
      ipcRenderer.on("launch", listener);
      return () => ipcRenderer.off("launch", listener);
    },

    onUpdateFailed: (callback: (payload: { message: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { message: string },
      ) => callback(payload);
      ipcRenderer.on("app:updateFailed", listener);
      return () => ipcRenderer.off("app:updateFailed", listener);
    },

    onCrashAnalysis: (
      callback: (
        versionName: string,
        instance: number,
        analysis: CrashAnalysisPayload,
      ) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        versionName: string,
        instance: number,
        analysis: CrashAnalysisPayload,
      ) => callback(versionName, instance, analysis);
      ipcRenderer.on("crashAnalysis", listener);
      return () => ipcRenderer.off("crashAnalysis", listener);
    },

    onFriendUpdate: (callback: (data: any) => void) => {
      const listener = (_event, data) => {
        callback(data);
      };
      ipcRenderer.on("friendUpdate", listener);
      return () => ipcRenderer.off("friendUpdate", listener);
    },

    onPlaytimeRecorded: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("playtimeRecorded", listener);
      return () => ipcRenderer.off("playtimeRecorded", listener);
    },

    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },

    onDownloaderInfo: (callback: (info: DownloaderInfo | null) => void) => {
      const listener = (_event, info) => {
        callback(info);
      };
      ipcRenderer.on("downloaderInfo", listener);
      return () => ipcRenderer.off("downloaderInfo", listener);
    },

    onDownloaderFailures: (
      callback: (info: DownloaderFailuresInfo) => void,
    ) => {
      const listener = (_event, info) => {
        callback(info);
      };
      ipcRenderer.on("downloaderFailures", listener);
      return () => ipcRenderer.off("downloaderFailures", listener);
    },

    onVersionInstallProgress: (
      callback: (info: VersionInstallProgress | null) => void,
    ) => {
      const listener = (_event, info) => {
        callback(info);
      };
      ipcRenderer.on("versionInstallProgress", listener);
      return () => ipcRenderer.off("versionInstallProgress", listener);
    },

    onDeepLink: (callback: (payload: LauncherDeepLink) => void) => {
      deepLinkSubscribers.add(callback);
      pendingDeepLinks.splice(0).forEach((payload) => callback(payload));
      return () => {
        deepLinkSubscribers.delete(callback);
      };
    },

    updater: {
      onStatus: (callback: (payload: UpdaterStatusPayload) => void) => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          payload: UpdaterStatusPayload,
        ) => {
          callback(payload);
        };
        ipcRenderer.on("updater:status", listener);
        return () => ipcRenderer.off("updater:status", listener);
      },
      onDownloadProgress: (callback: (progress: UpdaterProgress) => void) => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          progress: UpdaterProgress,
        ) => {
          callback(progress);
        };
        ipcRenderer.on("updater:downloadProgress", listener);
        return () => ipcRenderer.off("updater:downloadProgress", listener);
      },
    },
  },
};


if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(`Error exposing api to main world: ${error}`);
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api;
}
