/// <reference lib="dom" />
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { createPathUtils } from "./path";
import { IServer } from "@/types/ServersList";
import type { ServerPingResult } from "../main/utilities/serverPing";
import {
  IImportModpack,
  IVersion,
  IVersionClassData,
  IVersionConf,
  VersionDeleteResult,
} from "@/types/IVersion";
import { IAccountConf, IAuth, ILocalAccount } from "@/types/Account";
import {
  IExplorePage,
  IExploreQuery,
  IModpack,
  IModpackUpdate,
  UploadFileProgress,
} from "@/types/Backend";
import { IPublicProfile } from "@/types/Profile";
import {
  IFriendSettingsUpdate,
  IMutualFriends,
  INotificationPrefs,
  IUpdateUser,
  IUser,
} from "@/types/IUser";
import { IGroup, IVoiceTokenResponse } from "@/types/Voice";
import { INews, INewsPage, ISponsoredNewsAd } from "@/types/News";
import { IUpdateCheckRequest, IUpdateCheckResponse } from "@/types/Updates";
import {
  IAchievementReach,
  IGlobalLeaderboard,
  IOwnLeaderboardRank,
} from "@/types/Leaderboard";
import {
  CatalogListParams,
  CatalogListResult,
  ICatalogSkin,
  MyCommunityResult,
  PublishCommunityResult,
  SkinsData,
} from "@/types/SkinManager";
import { LoaderVersion } from "@/types/VersionsService";
import {
  AgentChatSummary,
  AgentStoredChat,
  AgentStreamEvent,
  AgentStreamRequest,
  AgentSyncPush,
  AgentSyncResult,
  AiModelInfo,
  AiProviderInput,
  AiProvidersState,
  AiProviderTestResult,
  RemoteAiChatMessage,
} from "@/types/Agent";
import { DownloadSource, TSettings, VoicePttCapture } from "@/types/Settings";
import { MirrorState } from "@/shared/mirrorMode";
import {
  IServerConf,
  IServerOption,
  IServerSettings,
  ServerCore,
  ServerRunResult,
  ServerRunStatePayload,
  ServerRunStatus,
  ServerSyncNotice,
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
  IWorldStatsAggregate,
  WorldDuplicateResult,
  WorldExportResult,
  WorldImportResult,
} from "@/types/World";
import {
  IWorldBackupList,
  WorldBackupCreateResult,
  WorldBackupDeleteResult,
  WorldBackupRestoreResult,
} from "@/types/WorldBackup";
import {
  ChunkEditResult,
  IChunkDetails,
  IChunkDimension,
  IChunkEditOptions,
  IChunkRegion,
  IChunkRegionScan,
} from "@/types/WorldChunks";
import {
  IAchievementStatsResult,
  IRemoteWorldStatsResponse,
} from "@/types/Achievements";
import { AuthlibEnsureResult } from "@/types/IAuthlib";
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
import type { FailureInfo } from "@/shared/errors";
import {
  ConnectivityCheckPlanEntry,
  ConnectivityCheckResult,
} from "@/types/Connectivity";
import { CrashAnalysisPayload } from "@/types/CrashAnalysis";
import {
  GameLogKind,
  IGameLogContent,
  IGameLogDiagnosis,
  IGameLogFile,
} from "@/types/GameLog";
import {
  IAiAnalysisResult,
  IAiFeedbackResult,
  IAiLogRequest,
  ICrashUnresolvedPayload,
} from "@/types/AiAnalysis";
import {
  ILauncherReleaseNote,
  ILauncherReleasePage,
} from "@/types/LauncherRelease";
import { IPlaytimeSyncEntry } from "@/types/VersionStatistics";
import {
  StorageBreakdown,
  StorageCleanupKind,
  StorageClearResult,
} from "@/types/Storage";
import { BlessedPathInfo } from "@/types/AllowedPath";
import {
  IPC_FAILURE_TOKEN_CHANNEL,
  IpcFailurePayload,
  readIpcFailureEnvelope,
} from "@/shared/ipcFailureEnvelope";

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

const LEGACY_MIGRATION_MARKER = "grubie:legacyLocalStorageMigrated";

if (window.location.protocol === "app:") {
  try {
    if (window.localStorage.getItem(LEGACY_MIGRATION_MARKER) === null) {
      const legacyDump = ipcRenderer.sendSync(
        "migration:legacyLocalStorage",
      ) as Record<string, string> | null;

      if (legacyDump) {
        for (const [key, value] of Object.entries(legacyDump)) {
          if (window.localStorage.getItem(key) === null) {
            window.localStorage.setItem(key, String(value));
          }
        }
      }

      window.localStorage.setItem(LEGACY_MIGRATION_MARKER, "1");
    }
  } catch {}
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

const pendingUpdateFailures: { message: string }[] = [];
const updateFailedSubscribers = new Set<
  (payload: { message: string }) => void
>();

ipcRenderer.on(
  "app:updateFailed",
  (_event: Electron.IpcRendererEvent, payload: { message: string }) => {
    if (updateFailedSubscribers.size === 0) {
      pendingUpdateFailures.push(payload);
      return;
    }

    updateFailedSubscribers.forEach((callback) => callback(payload));
  },
);

export interface IElectronAPI {
  platform: string;
  os: {
    totalmem: () => Promise<number>;
  };
  storage: {
    getBreakdown: () => Promise<StorageBreakdown>;
    clearCache: () => Promise<StorageClearResult>;
    cleanup: (
      kind: StorageCleanupKind,
      names?: string[],
    ) => Promise<StorageClearResult>;
  };
  path: {
    join: (...args: string[]) => string;
    basename: (filePath: string, suffix?: string) => string;
    extname: (filePath: string) => string;
  };
  fs: {
    readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
    readFileBuffer: (target: string) => Promise<Uint8Array | null>;
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
    sha1: (filePath: string) => Promise<string>;
    readdir: (dirPath: string) => Promise<string[]>;
    extractZip: (zipPath: string, destination: string) => Promise<boolean>;
    rename: (oldPath: string, newPath: string) => Promise<boolean>;
    writeJSON: (filePath: string, data: any) => Promise<boolean>;
    writeJSONSync: (filePath: string, data: any) => string;
    readJSON: <T>(filePath: string, encoding?: BufferEncoding) => Promise<T | null>;
    getDirectories: (source: string) => Promise<string[]>;
  };
  clipboard: {
    writeText: (text: string) => Promise<boolean>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    openPath: (path: string) => Promise<void>;
    trashItem: (path: string) => Promise<boolean>;
  };
  file: {
    archiveFiles: (
      filesToArchive: string[],
      zipPath: string,
      basePath?: string,
    ) => Promise<boolean>;
    archiveForPublish: (
      filesToArchive: string[],
      zipPath: string,
      basePath?: string,
    ) => Promise<boolean>;
    getTotalSizes: (filePaths: string[]) => Promise<number | null>;
    fromBuffer: (data: ArrayBuffer) => string;
    download(items: DownloadItem[], limit: number): Promise<boolean>;
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
    ping: (address: string) => Promise<ServerPingResult>;
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
    getPauseState: () => Promise<"off" | "pending" | "held">;
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
    ) => Promise<VersionDeleteResult | false>;
    save: (versionConf: IVersionConf) => Promise<boolean>;
    share: {
      uploadMods: (
        at: string,
        versionConf: IVersionConf,
      ) => Promise<{
        mods: ILocalProject[];
        success: boolean;
        uploaded: number;
        failures: string[];
      }>;
    };
  };
  accounts: {
    load: () => Promise<IAccountConf | null>;
    save: (
      accounts: IAccountConf["accounts"],
      lastPlayed: string | null,
    ) => Promise<boolean>;
  };
  auth: {
    microsoft: (
      code: string,
      codeVerifier?: string,
    ) => Promise<IAuthResponse | null>;
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
      provider: "microsoft" | "discord" | "elyby" | "twitch" | "github";
    }>;
    stopServer: () => Promise<boolean>;
  };
  backend: {
    getModpack: (
      at: string,
      code: string,
    ) => Promise<{
      status: "error" | "success" | "not_found";
      data: IModpack | null;
    }>;
    getOwnModpacks: (at: string) => Promise<IModpack[] | null>;
    exploreModpacks: (query: IExploreQuery) => Promise<IExplorePage | null>;
    getPublicProfile: (
      nickname: string,
      userId?: string,
    ) => Promise<IPublicProfile | null>;
    shareModpack: (
      at: string,
      modpack: { conf: IModpack["conf"]; isPublic?: boolean },
    ) => Promise<string | null>;
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
    getMutualFriends: (
      at: string,
      id: string,
    ) => Promise<IMutualFriends | null>;
    getRemoteStats: (at: string) => Promise<IRemoteWorldStatsResponse>;
    groupsList: (at: string) => Promise<IGroup[] | null>;
    groupCreate: (at: string, name: string) => Promise<IGroup | null>;
    groupRename: (
      at: string,
      groupId: string,
      name: string,
    ) => Promise<IGroup | null>;
    groupDelete: (at: string, groupId: string) => Promise<boolean>;
    groupJoinVoice: (
      at: string,
      groupId: string,
    ) => Promise<IVoiceTokenResponse | null>;
    groupJoinByCode: (
      at: string,
      code: string,
    ) => Promise<
      | IGroup
      | "banned"
      | "group_full"
      | "rate_limited"
      | "not_found"
      | "invalid_code"
      | null
    >;
    groupLeave: (at: string, groupId: string) => Promise<boolean>;
    groupKickMember: (
      at: string,
      groupId: string,
      memberId: string,
    ) => Promise<boolean>;
    groupBanMember: (
      at: string,
      groupId: string,
      memberId: string,
    ) => Promise<boolean>;
    groupUnbanMember: (
      at: string,
      groupId: string,
      memberId: string,
    ) => Promise<boolean>;
    groupTransferOwner: (
      at: string,
      groupId: string,
      memberId: string,
    ) => Promise<boolean>;
    groupResetCode: (at: string, groupId: string) => Promise<IGroup | null>;
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
    ) => Promise<boolean>;
    modpackDownloaded: (at: string, shareCode: string) => Promise<boolean>;
    getNews: () => Promise<INews[]>;
    getNewsPage: (params: {
      limit?: number;
      cursor?: string;
      source?: string;
    }) => Promise<INewsPage | null>;
    checkUpdates: (
      request: IUpdateCheckRequest,
    ) => Promise<IUpdateCheckResponse | null>;
    getGlobalLeaderboard: (limit: number) => Promise<IGlobalLeaderboard | null>;
    getOwnLeaderboardRank: (at: string) => Promise<IOwnLeaderboardRank | null>;
    getAchievementReach: () => Promise<IAchievementReach | null>;
    getWhatsNew: (
      version: string,
      locale: string,
    ) => Promise<ILauncherReleaseNote | null>;
    getLauncherReleases: (
      locale: string,
      limit: number,
    ) => Promise<ILauncherReleasePage | null>;
    getSponsoredNewsAd: (
      locale: string,
      hiddenIds: string[],
    ) => Promise<ISponsoredNewsAd | null>;
    recordSponsoredAdImpression: (id: string) => Promise<boolean>;
    recordSponsoredAdClick: (id: string) => Promise<boolean>;
    approveSiteLogin: (at: string, requestId: string) => Promise<boolean>;
    declineSiteLogin: (at: string, requestId: string) => Promise<boolean>;
    discordLink: (
      at: string,
      code: string,
    ) => Promise<{ discordId: string; username: string } | null>;
    discordUnlink: (at: string) => Promise<{ discordId: null } | null>;
    telegramLinkStart: (
      at: string,
    ) => Promise<{ botUrl: string; expiresAt: string } | null>;
    telegramUnlink: (
      at: string,
    ) => Promise<{ provider: string; linked: null } | null>;
    updateNotifications: (
      at: string,
      id: string,
      prefs: Partial<INotificationPrefs>,
    ) => Promise<IUser | null>;
    apiBaseUrl: () => Promise<string>;
    onApiBaseUrl: (callback: (baseUrl: string) => void) => () => void;
    aiComplete: (at: string, prompt: string) => Promise<string | null>;
    checkHealth: () => Promise<boolean>;
  };
  voice: {
    setPtt: (
      bind: { type: "key" | "mouse"; code: number } | null,
    ) => Promise<boolean>;
    capturePttBind: () => Promise<VoicePttCapture>;
    setSessionActive: (active: boolean) => Promise<void>;
    onPttDown: (callback: () => void) => () => void;
    onPttUp: (callback: () => void) => () => void;
  };
  versions: {
    getList: (
      loader: "vanilla" | "forge" | "neoforge" | "fabric" | "quilt",
      includeSnapshots?: boolean,
    ) => Promise<IVersion[] | null>;
    getLoaderVersions: (
      loader: "forge" | "neoforge" | "fabric" | "quilt",
      versionId: string,
    ) => Promise<LoaderVersion[] | null>;
  };
  game: {
    closeGame: (versionName: string, instance: number) => Promise<boolean>;
  };
  logs: {
    list: (versionPath: string) => Promise<IGameLogFile[]>;
    read: (
      versionPath: string,
      name: string,
      kind: GameLogKind,
    ) => Promise<IGameLogContent | null>;
    analyze: (
      versionPath: string,
      name: string,
      kind: GameLogKind,
      exitCode?: number,
    ) => Promise<IGameLogDiagnosis | null>;
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
    syncLive: (
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
    setUnsavedGuard: (value: boolean) => Promise<void>;
    confirmClose: () => Promise<void>;
    onCloseRequested: (
      callback: (reason: {
        unsaved: boolean;
        servers: boolean;
        install: boolean;
      }) => void,
    ) => () => void;
    onNotificationClick: (
      callback: (action: NotificationClickAction) => void,
    ) => () => void;
  };
  allowedPaths: {
    list: () => Promise<BlessedPathInfo[]>;
    revoke: (target: string) => Promise<boolean>;
  };
  connectivity: {
    plan: () => Promise<ConnectivityCheckPlanEntry[]>;
    test: () => Promise<ConnectivityCheckResult[]>;
    onResult: (
      callback: (result: ConnectivityCheckResult) => void,
    ) => () => void;
  };
  mirror: {
    setSource: (source: DownloadSource) => Promise<void>;
    getState: () => Promise<MirrorState>;
  };
  shortcut: {
    create: (
      versionName: string,
      instance?: number,
      imageSource?: string,
    ) => Promise<{ success: boolean; error?: string }>;
  };
  image: {
    bytes: (source: string) => Promise<string | null>;
  };
  server: {
    install: (
      account: ILocalAccount | undefined,
      downloadLimit: number,
      versionPath: string,
      serverPath: string,
      conf: IServerConf,
      versionConf?: IVersionConf,
      options?: { keepProgressOpen?: boolean },
    ) => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
    getSettings: (filePath: string) => Promise<IServerSettings | null>;
    runOptions: (
      serverPath: string,
    ) => Promise<{ memory: number | null; aikarFlags: boolean | null }>;
    stopAll: () => Promise<boolean>;
    editXmx: (serverPath: string, memory: number) => Promise<boolean>;
    isPortAvailable: (port: number) => Promise<boolean>;
    setAikar: (serverPath: string, enabled: boolean) => Promise<boolean>;
    updateProperties: (
      filePath: string,
      settings: IServerSettings,
    ) => Promise<boolean>;
    start: (serverPath: string) => Promise<ServerRunResult>;
    stop: (serverPath: string, force?: boolean) => Promise<ServerRunResult>;
    command: (serverPath: string, command: string) => Promise<ServerRunResult>;
    lanAddress: () => Promise<string | null>;
    runStatus: (serverPath: string) => Promise<ServerRunStatus>;
    onRunState: (callback: (payload: ServerRunStatePayload) => void) => () => void;
    onRunOutput: (
      callback: (payload: { serverPath: string; lines: string[] }) => void,
    ) => () => void;
  };
  skins: {
    load: (
      launcherPath: string,
      platform: "microsoft" | "discord" | "elyby",
      userId: string,
      nickname: string,
      accessToken: string,
    ) => Promise<SkinsData | null>;
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
    regenerateSkin: (
      userId: string,
      platform: string,
    ) => Promise<SkinsData | null>;
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
    catalog: {
      list: (params?: CatalogListParams) => Promise<CatalogListResult | null>;
      download: (id: string) => Promise<{ downloads: number } | null>;
      get: (id: string) => Promise<ICatalogSkin | null>;
    };
    publishCommunity: (
      userId: string,
      platform: string,
      skinId: string,
      backendToken: string,
      name?: string,
      type?: "skin" | "cape" | "pack",
      tags?: string,
    ) => Promise<PublishCommunityResult>;
    tags: {
      suggest: (q?: string, limit?: number) => Promise<string[]>;
    };
    importPack: (
      userId: string,
      platform: string,
      skinUrl: string,
      capeUrl: string,
    ) => Promise<{ ok: boolean }>;
    community: {
      mine: (backendToken: string) => Promise<MyCommunityResult | null>;
      delete: (backendToken: string, id: string) => Promise<{ ok: boolean }>;
    };
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
    ) => Promise<IVersionDependency[] | null>;
    checkLocalMod: (modPath: string) => Promise<ILocalFileInfo | null>;
    checkModpack: (
      modpackPath: string,
      pack?: IProject,
      selectVersion?: IVersionModManager,
    ) => Promise<IModpackModManager | null>;
    ptToFolder: (type: ProjectType) => Promise<string>;
    resolveCfDownload: (
      fileId: number,
      fileName: string,
    ) => Promise<string | null>;
    compareMods: (
      mods1: ILocalProject[],
      mods2: ILocalProject[],
    ) => Promise<boolean>;
  };
  worlds: {
    loadVersionStatistics: (
      versionPath: string,
      account: ILocalAccount,
    ) => Promise<IWorldStatsAggregate | null>;
    loadAchievementStats: (
      account: ILocalAccount,
    ) => Promise<IAchievementStatsResult | null>;
    readWorld: (
      worldPath: string,
      account: ILocalAccount,
    ) => Promise<IWorld | null>;
    writeName: (worldPath: string, newName: string) => Promise<string | null>;
    count: (versionPath: string) => Promise<number | null>;
    folderSizes: (versionPath: string) => Promise<Record<string, number>>;
    duplicate: (
      worldPath: string,
      newName: string,
    ) => Promise<WorldDuplicateResult>;
    export: (
      worldPath: string,
      destinationDir: string,
    ) => Promise<WorldExportResult>;
    import: (
      zipPath: string,
      versionPath: string,
    ) => Promise<WorldImportResult>;
    listBackups: (worldPath: string) => Promise<IWorldBackupList>;
    countBackups: (versionPath: string) => Promise<Record<string, number>>;
    createBackup: (
      worldPath: string,
      keep: number,
    ) => Promise<WorldBackupCreateResult>;
    restoreBackup: (
      backupId: string,
      worldPath: string,
      keep: number,
    ) => Promise<WorldBackupRestoreResult>;
    deleteBackup: (backupId: string) => Promise<WorldBackupDeleteResult>;
    deletePreserved: (targetPath: string) => Promise<WorldBackupDeleteResult>;
  };
  worldChunks: {
    dimensions: (worldPath: string) => Promise<IChunkDimension[]>;
    regions: (worldPath: string, dimension: string) => Promise<IChunkRegion[]>;
    scanRegion: (
      worldPath: string,
      dimension: string,
      regionX: number,
      regionZ: number,
    ) => Promise<IChunkRegionScan | null>;
    inspect: (
      worldPath: string,
      dimension: string,
      chunkX: number,
      chunkZ: number,
    ) => Promise<IChunkDetails | null>;
    /** PNG bytes of the region's top-down render, or null when it cannot be drawn. */
    renderSurface: (
      worldPath: string,
      dimension: string,
      regionX: number,
      regionZ: number,
    ) => Promise<Uint8Array | null>;
    delete: (
      worldPath: string,
      dimension: string,
      coords: number[],
      options: IChunkEditOptions,
    ) => Promise<ChunkEditResult>;
    resetInhabited: (
      worldPath: string,
      dimension: string,
      coords: number[],
      options: IChunkEditOptions,
    ) => Promise<ChunkEditResult>;
  };
  statistics: {
    getSyncQueue: () => Promise<IPlaytimeSyncEntry[]>;
    resolveSyncEntries: (ids: string[]) => Promise<boolean>;
  };
  ai: {
    prepareCrashReport: (
      versionPath: string,
      exitCode?: number,
      nickname?: string,
      versionName?: string,
      instance?: number,
    ) => Promise<IAiLogRequest | null>;
    analyzeCrash: (
      accessToken: string,
      requestId: string,
      locale: string,
    ) => Promise<IAiAnalysisResult>;
    sendFeedback: (
      accessToken: string,
      analysisId: string,
      helpful: boolean,
    ) => Promise<IAiFeedbackResult>;
  };
  agent: {
    providers: {
      list: () => Promise<AiProvidersState | null>;
      save: (input: AiProviderInput) => Promise<AiProvidersState | null>;
      remove: (id: string) => Promise<AiProvidersState | null>;
      select: (id: string) => Promise<AiProvidersState | null>;
      test: (payload: {
        id?: string;
        baseUrl?: string;
        apiKey?: string;
      }) => Promise<AiProviderTestResult>;
    };
    models: {
      list: (providerId: string) => Promise<AiModelInfo[]>;
    };
    chat: {
      start: (runId: string, request: AgentStreamRequest) => Promise<boolean>;
      abort: (runId: string) => Promise<boolean>;
    };
    chats: {
      list: () => Promise<AgentChatSummary[]>;
      read: (chatId: string) => Promise<AgentStoredChat | null>;
      write: (chat: AgentStoredChat) => Promise<boolean>;
      remove: (chatId: string) => Promise<boolean>;
      tombstones: () => Promise<string[]>;
      forgetTombstone: (remoteId: string) => Promise<boolean>;
      sync: (
        accessToken: string,
        pending: AgentSyncPush[],
      ) => Promise<AgentSyncResult>;
      remoteMessages: (
        accessToken: string,
        chatId: string,
      ) => Promise<RemoteAiChatMessage[]>;
      remoteRemove: (accessToken: string, chatId: string) => Promise<boolean>;
    };
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
    onIpcError: (
      callback: (payload: {
        channel: string;
        message: string;
        notify?: boolean;
        failure?: FailureInfo;
      }) => void,
    ) => () => void;
    onCrashAnalysis: (
      callback: (
        versionName: string,
        instance: number,
        analysis: CrashAnalysisPayload,
      ) => void,
    ) => () => void;
    onCrashUnresolved: (
      callback: (payload: ICrashUnresolvedPayload) => void,
    ) => () => void;
    onFriendUpdate: (callback: (data: any) => void) => () => void;
    onPlaytimeRecorded: (callback: () => void) => () => void;
    onDownloaderInfo: (
      callback: (info: DownloaderInfo | null) => void,
    ) => () => void;
    onDownloaderFailures: (
      callback: (info: DownloaderFailuresInfo) => void,
    ) => () => void;
    onServerSyncNotice: (
      callback: (notice: ServerSyncNotice) => void,
    ) => () => void;
    onModsQuarantined: (
      callback: (notice: { versionName: string; entries: string[] }) => void,
    ) => () => void;
    onVersionInstallProgress: (
      callback: (info: VersionInstallProgress | null) => void,
    ) => () => void;
    onAgentStream: (
      callback: (payload: AgentStreamEvent) => void,
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

type IpcFailureListener = (payload: IpcFailurePayload) => void;

const ipcFailureListeners = new Set<IpcFailureListener>();

function dispatchIpcFailure(payload: IpcFailurePayload): void {
  for (const listener of [...ipcFailureListeners]) {
    try {
      listener(payload);
    } catch (error) {
      console.error("ipc:error listener failed", error);
    }
  }
}

ipcRenderer.on(
  "ipc:error",
  (_event: Electron.IpcRendererEvent, payload: IpcFailurePayload) =>
    dispatchIpcFailure(payload),
);

const ipcFailureToken: string | undefined = (() => {
  try {
    const token = ipcRenderer.sendSync(IPC_FAILURE_TOKEN_CHANNEL);
    return typeof token === "string" && token ? token : undefined;
  } catch {
    return undefined;
  }
})();

function invoke<T = any>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args).then((result) => {
    const envelope = readIpcFailureEnvelope(result, ipcFailureToken);
    if (!envelope) return result as T;

    const { token: _token, ...payload } = envelope.__grubieIpcFailure;
    dispatchIpcFailure(payload);
    return envelope.value as T;
  });
}

const pathUtils = createPathUtils(process.platform === "win32");

export const api: IElectronAPI = {
  platform: process.platform,
  os: {
    totalmem: () => invoke("os:totalmem"),
  },
  storage: {
    getBreakdown: () => invoke("storage:getBreakdown"),
    clearCache: () => invoke("storage:clearCache"),
    cleanup: (kind: StorageCleanupKind, names?: string[]) =>
      invoke("storage:cleanup", kind, names),
  },
  path: {
    join: (...args: string[]) => pathUtils.join(...args),
    basename: (filePath: string, suffix?: string) =>
      pathUtils.basename(filePath, suffix),
    extname: (filePath: string) => pathUtils.extname(filePath),
  },
  fs: {
    readFile: (filePath: string, encoding: BufferEncoding) =>
      invoke("fs:readFile", filePath, encoding),
    readFileBuffer: (target: string) =>
      invoke("fs:readFileBuffer", target),
    rimraf: (targetPath: string) => invoke("fs:rimraf", targetPath),
    ensure: (dirPath: string) => invoke("fs:ensure", dirPath),
    copy: (src: string, dest: string) =>
      invoke("fs:copy", src, dest),
    writeFile: (
      filePath: string,
      data: string | Uint8Array,
      encoding: BufferEncoding = "utf-8",
    ) => invoke("fs:writeFile", filePath, data, encoding),
    pathExists: (targetPath: string) =>
      invoke("fs:pathExists", targetPath),
    readdirWithTypes: (folderPath: string) =>
      invoke("fs:readdirWithTypes", folderPath),
    sha1: (filePath: string) => invoke("fs:sha1", filePath),
    readdir: (dirPath: string) => invoke("fs:readdir", dirPath),
    extractZip: (zipPath: string, destination: string) =>
      invoke("fs:extractZip", zipPath, destination),
    rename: (oldPath: string, newPath: string) =>
      invoke("fs:rename", oldPath, newPath),
    writeJSON: (filePath: string, data: any) =>
      invoke("fs:writeJSON", filePath, data),
    writeJSONSync: (filePath: string, data: any): string => {
      try {
        return String(ipcRenderer.sendSync("fs:writeJSONSync", filePath, data));
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    readJSON: <_>(filePath: string, encoding?: BufferEncoding) =>
      invoke("fs:readJSON", filePath, encoding),
    getDirectories: (source: string) =>
      invoke("fs:getDirectories", source),
  },
  clipboard: {
    writeText: (text: string) =>
      invoke("clipboard:writeText", text),
  },
  shell: {
    openExternal: (url: string) =>
      invoke("shell:openExternal", url),
    openPath: (path: string) => invoke("shell:openPath", path),
    trashItem: (path: string) => invoke("shell:trashItem", path),
  },
  file: {
    archiveFiles: (
      filesToArchive: string[],
      zipPath: string,
      basePath?: string,
    ) =>
      invoke(
        "file:archiveFiles",
        filesToArchive,
        zipPath,
        basePath,
      ),
    archiveForPublish: (
      filesToArchive: string[],
      zipPath: string,
      basePath?: string,
    ) =>
      invoke(
        "file:archiveForPublish",
        filesToArchive,
        zipPath,
        basePath,
      ),
    getTotalSizes: (filePaths: string[]) =>
      invoke("file:getTotalSizes", filePaths),
    fromBuffer: (data: ArrayBuffer) => Buffer.from(data).toString("binary"),
    download: (items: DownloadItem[], limit: number) =>
      invoke("file:download", items, limit),
  },
  servers: {
    write: (servers: IServer[], filePath: string) =>
      invoke("servers:write", servers, filePath),
    versions: (versions: IVersionConf[]) =>
      invoke("servers:versions", versions),
    get: (version: string, loader: Loader) =>
      invoke("servers:get", version, loader),
    read: (path: string) => invoke("servers:read", path),
    ping: (address: string) => invoke("servers:ping", address),
    compare: (servers1: IServer[], servers2: IServer[]) =>
      invoke("servers:compare", servers1, servers2),
  },
  version: {
    import: (filePath: string, tempPath: string) =>
      invoke("version:import", filePath, tempPath),
    init: (versionConf: IVersionConf) =>
      invoke("version:init", versionConf),
    install: (
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      extraItems?: DownloadItem[],
      options?: VersionInstallOptions,
    ) =>
      invoke(
        "version:install",
        account,
        settings,
        versionConf,
        extraItems,
        options,
      ),
    cancelInstall: () => invoke("version:cancelInstall"),
    pauseInstall: () => invoke("version:pauseInstall"),
    resumeInstall: () => invoke("version:resumeInstall"),
    getPauseState: () => invoke("version:getPauseState"),
    ensureAuthlib: (account: ILocalAccount, versionConf: IVersionConf) =>
      invoke("version:ensureAuthlib", account, versionConf),
    getRunCommand: (
      account: ILocalAccount,
      settings: TSettings,
      versionConf: IVersionConf,
      authData: IAuth | null,
      isRelative: boolean,
      quick?: { single?: string; multiplayer?: string },
    ) =>
      invoke(
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
      invoke(
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
    ) => invoke("version:delete", account, versionConf, isFull),
    save: (versionConf: IVersionConf) =>
      invoke("version:save", versionConf),
    share: {
      uploadMods: (at: string, versionConf: IVersionConf) =>
        invoke("share:uploadMods", at, versionConf),
    },
  },
  accounts: {
    load: () => invoke("accounts:load"),
    save: (accounts: IAccountConf["accounts"], lastPlayed: string | null) =>
      invoke("accounts:save", accounts, lastPlayed),
  },
  auth: {
    microsoft: (code: string, codeVerifier?: string) =>
      invoke("auth:microsoft", code, codeVerifier),
    microsoftRefresh: (refreshToken: string, id: string) =>
      invoke("auth:microsoft:refresh", refreshToken, id),
    elyby: (code: string) => invoke("auth:elyby", code),
    elybyRefresh: (refreshToken: string, id: string) =>
      invoke("auth:elyby:refresh", refreshToken, id),
    discord: (code: string) => invoke("auth:discord", code),
    discordRefresh: (refreshToken: string, id: string) =>
      invoke("auth:discord:refresh", refreshToken, id),
    startServer: (expectedState: string) =>
      invoke("auth:startServer", expectedState),
    stopServer: () => invoke("auth:stopServer"),
  },
  backend: {
    getModpack: (at: string, code: string) =>
      invoke("backend:getModpack", at, code),
    getOwnModpacks: (at: string) =>
      invoke("backend:getOwnModpacks", at),
    exploreModpacks: (query: IExploreQuery) =>
      invoke("backend:exploreModpacks", query),
    getPublicProfile: (nickname: string, userId?: string) =>
      invoke("backend:getPublicProfile", nickname, userId),
    shareModpack: (
      at: string,
      modpack: { conf: IModpack["conf"]; isPublic?: boolean },
    ) => invoke("backend:shareModpack", at, modpack),
    updateModpack: (at: string, shareCode: string, update: IModpackUpdate) =>
      invoke("backend:updateModpack", at, shareCode, update),
    deleteModpack: (at: string, shareCode: string) =>
      invoke("backend:deleteModpack", at, shareCode),
    updateUser: (at: string, id: string, user: IUpdateUser) =>
      invoke("backend:updateUser", at, id, user),
    getUser: (at: string, id: string) =>
      invoke("backend:getUser", at, id),
    getMutualFriends: (at: string, id: string) =>
      invoke("backend:getMutualFriends", at, id),
    getRemoteStats: (at: string) =>
      invoke("backend:getRemoteStats", at),
    groupsList: (at: string) => invoke("backend:groupsList", at),
    groupCreate: (at: string, name: string) =>
      invoke("backend:groupCreate", at, name),
    groupRename: (at: string, groupId: string, name: string) =>
      invoke("backend:groupRename", at, groupId, name),
    groupDelete: (at: string, groupId: string) =>
      invoke("backend:groupDelete", at, groupId),
    groupJoinVoice: (at: string, groupId: string) =>
      invoke("backend:groupJoinVoice", at, groupId),
    groupJoinByCode: (at: string, code: string) =>
      invoke("backend:groupJoinByCode", at, code),
    groupLeave: (at: string, groupId: string) =>
      invoke("backend:groupLeave", at, groupId),
    groupKickMember: (at: string, groupId: string, memberId: string) =>
      invoke("backend:groupKickMember", at, groupId, memberId),
    groupBanMember: (at: string, groupId: string, memberId: string) =>
      invoke("backend:groupBanMember", at, groupId, memberId),
    groupUnbanMember: (at: string, groupId: string, memberId: string) =>
      invoke("backend:groupUnbanMember", at, groupId, memberId),
    groupTransferOwner: (at: string, groupId: string, memberId: string) =>
      invoke("backend:groupTransferOwner", at, groupId, memberId),
    groupResetCode: (at: string, groupId: string) =>
      invoke("backend:groupResetCode", at, groupId),
    resetFriendCode: (at: string, id: string) =>
      invoke("backend:resetFriendCode", at, id),
    updateFriendSettings: (
      at: string,
      id: string,
      settings: IFriendSettingsUpdate,
    ) => invoke("backend:updateFriendSettings", at, id, settings),
    uploadFileFromPath: (
      at: string,
      filePath: string,
      fileName?: string,
      folder?: string,
      progressId?: string,
      direct?: boolean,
    ) =>
      invoke(
        "backend:uploadFileFromPath",
        at,
        filePath,
        fileName,
        folder,
        progressId,
        direct,
      ),
    onUploadFileProgress: (
      callback: (progress: UploadFileProgress) => void,
    ) => {
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
      invoke("backend:deleteFile", at, key, isDirectory),
    modpackDownloaded: (at: string, shareCode: string) =>
      invoke("backend:modpackDownloaded", at, shareCode),
    getNews: () => invoke("backend:getNews"),
    getNewsPage: (params: {
      limit?: number;
      cursor?: string;
      source?: string;
    }) => invoke("backend:getNewsPage", params),
    checkUpdates: (request: IUpdateCheckRequest) =>
      invoke("backend:checkUpdates", request),
    getGlobalLeaderboard: (limit: number) =>
      invoke("backend:getGlobalLeaderboard", limit),
    getOwnLeaderboardRank: (at: string) =>
      invoke("backend:getOwnLeaderboardRank", at),
    getAchievementReach: () =>
      invoke("backend:getAchievementReach"),
    getWhatsNew: (version: string, locale: string) =>
      invoke("backend:getWhatsNew", version, locale),
    getLauncherReleases: (locale: string, limit: number) =>
      invoke("backend:getLauncherReleases", locale, limit),
    getSponsoredNewsAd: (locale: string, hiddenIds: string[]) =>
      invoke("backend:getSponsoredNewsAd", locale, hiddenIds),
    recordSponsoredAdImpression: (id: string) =>
      invoke("backend:recordSponsoredAdImpression", id),
    recordSponsoredAdClick: (id: string) =>
      invoke("backend:recordSponsoredAdClick", id),
    approveSiteLogin: (at: string, requestId: string) =>
      invoke("backend:approveSiteLogin", at, requestId),
    declineSiteLogin: (at: string, requestId: string) =>
      invoke("backend:declineSiteLogin", at, requestId),
    discordLink: (at: string, code: string) =>
      invoke("backend:discordLink", at, code),
    discordUnlink: (at: string) =>
      invoke("backend:discordUnlink", at),
    telegramLinkStart: (at: string) =>
      invoke("backend:telegramLinkStart", at),
    telegramUnlink: (at: string) =>
      invoke("backend:telegramUnlink", at),
    updateNotifications: (
      at: string,
      id: string,
      prefs: Partial<INotificationPrefs>,
    ) => invoke("backend:updateNotifications", at, id, prefs),
    apiBaseUrl: () => invoke("backend:apiBaseUrl"),
    onApiBaseUrl: (callback: (baseUrl: string) => void) => {
      const listener = (_: unknown, baseUrl: string) => callback(baseUrl);
      ipcRenderer.on("api:baseUrl", listener);
      return () => ipcRenderer.off("api:baseUrl", listener);
    },
    aiComplete: (at: string, prompt: string) =>
      invoke("backend:aiComplete", at, prompt),
    checkHealth: () => invoke("backend:checkHealth"),
  },
  voice: {
    setPtt: (bind: { type: "key" | "mouse"; code: number } | null) =>
      invoke("voice:setPtt", bind),
    capturePttBind: () => invoke("voice:capturePttBind"),
    setSessionActive: (active: boolean) =>
      invoke("voice:setSessionActive", active),
    onPttDown: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("voice:pttDown", listener);
      return () => ipcRenderer.off("voice:pttDown", listener);
    },
    onPttUp: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("voice:pttUp", listener);
      return () => ipcRenderer.off("voice:pttUp", listener);
    },
  },
  versions: {
    getList: (
      loader: "vanilla" | "forge" | "neoforge" | "fabric" | "quilt",
      includeSnapshots: boolean = false,
    ) => invoke("versions:getList", loader, includeSnapshots),
    getLoaderVersions: (
      loader: "forge" | "neoforge" | "fabric" | "quilt",
      versionId: string,
    ) => invoke("versions:getLoaderVersions", loader, versionId),
  },
  game: {
    closeGame: (versionName: string, instance: number) =>
      invoke("game:closeGame", versionName, instance),
  },
  logs: {
    list: (versionPath: string) => invoke("logs:list", versionPath),
    read: (versionPath: string, name: string, kind: GameLogKind) =>
      invoke("logs:read", versionPath, name, kind),
    analyze: (
      versionPath: string,
      name: string,
      kind: GameLogKind,
      exitCode?: number,
    ) => invoke("logs:analyze", versionPath, name, kind, exitCode),
  },
  mods: {
    check: (
      settings: TSettings,
      versionConf: IVersionConf,
      server?: IServerConf,
      options?: VersionInstallOptions,
    ) =>
      invoke("mods:check", settings, versionConf, server, options),
    downloadOther: (
      settings: TSettings,
      versionConf: IVersionConf,
      options?: VersionInstallOptions,
    ) =>
      invoke("mods:downloadOther", settings, versionConf, options),
    syncLive: (
      settings: TSettings,
      versionConf: IVersionConf,
      options?: VersionInstallOptions,
    ) => invoke("mods:syncLive", settings, versionConf, options),
    cancelInstall: () => invoke("mods:cancelInstall"),
  },
  other: {
    getVersion: () => invoke("other:getVersion"),
    openFileDialog: (
      isFolder?: boolean,
      filters?: { name: string; extensions: string[] }[],
      multi?: boolean,
    ) => invoke("other:openFileDialog", isFolder, filters, multi),
    getPathForFile: (file: File) => {
      const filePath = webUtils.getPathForFile(file);
      if (filePath) ipcRenderer.sendSync("safepath:bless", filePath);
      return filePath;
    },
    getPaths: () => invoke("other:getPaths"),
    getPath: (pathKey: string) => invoke("other:getPath", pathKey),
    notify: (
      options: Electron.NotificationConstructorOptions,
      clickAction?: NotificationClickAction,
    ) => invoke("other:notify", options, clickAction),
    getLocale: () => invoke("other:getLocale"),
    restoreWindow: () => invoke("other:restoreWindow"),
    setUnsavedGuard: (value: boolean) =>
      invoke("other:setUnsavedGuard", value),
    confirmClose: () => invoke("other:confirmClose"),
    onCloseRequested: (
      callback: (reason: {
        unsaved: boolean;
        servers: boolean;
        install: boolean;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        reason?: { unsaved: boolean; servers: boolean; install?: boolean },
      ) =>
        callback({
          unsaved: reason?.unsaved ?? true,
          servers: reason?.servers ?? false,
          install: reason?.install ?? false,
        });
      ipcRenderer.on("app:closeRequested", listener);
      return () => ipcRenderer.off("app:closeRequested", listener);
    },
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
  allowedPaths: {
    list: () => invoke("safepath:list"),
    revoke: (target: string) => invoke("safepath:revoke", target),
  },
  connectivity: {
    plan: () => invoke("connectivity:plan"),
    test: () => invoke("connectivity:test"),
    onResult: (callback: (result: ConnectivityCheckResult) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        result: ConnectivityCheckResult,
      ) => callback(result);
      ipcRenderer.on("connectivity:result", listener);
      return () => ipcRenderer.off("connectivity:result", listener);
    },
  },
  mirror: {
    setSource: (source: DownloadSource) =>
      invoke("mirror:setSource", source),
    getState: () => invoke("mirror:getState"),
  },
  shortcut: {
    create: (versionName: string, instance?: number, imageSource?: string) =>
      invoke("shortcut:create", versionName, instance, imageSource),
  },
  image: {
    bytes: (source: string) => invoke("image:bytes", source),
  },
  server: {
    install: (
      account: ILocalAccount | undefined,
      downloadLimit: number,
      versionPath: string,
      serverPath: string,
      conf: IServerConf,
      versionConf?: IVersionConf,
      options?: { keepProgressOpen?: boolean },
    ) =>
      invoke(
        "server:install",
        account,
        downloadLimit,
        versionPath,
        serverPath,
        conf,
        versionConf,
        options,
      ),
    getSettings: (filePath: string) =>
      invoke("server:getSettings", filePath),
    runOptions: (serverPath: string) =>
      invoke("server:runOptions", serverPath),
    stopAll: () => invoke("server:stopAll"),
    editXmx: (serverPath: string, memory: number) =>
      invoke("server:editXmx", serverPath, memory),
    isPortAvailable: (port: number) =>
      invoke("server:isPortAvailable", port),
    setAikar: (serverPath: string, enabled: boolean) =>
      invoke("server:setAikar", serverPath, enabled),
    updateProperties: (filePath: string, settings: IServerSettings) =>
      invoke("server:updateProperties", filePath, settings),
    start: (serverPath: string) =>
      invoke("server:start", serverPath),
    stop: (serverPath: string, force?: boolean) =>
      invoke("server:stop", serverPath, force),
    command: (serverPath: string, command: string) =>
      invoke("server:command", serverPath, command),
    lanAddress: () => invoke("server:lanAddress"),
    runStatus: (serverPath: string) =>
      invoke("server:runStatus", serverPath),
    onRunState: (callback: (payload: ServerRunStatePayload) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: ServerRunStatePayload,
      ) => callback(payload);
      ipcRenderer.on("server:state", listener);
      return () => ipcRenderer.off("server:state", listener);
    },
    onRunOutput: (
      callback: (payload: { serverPath: string; lines: string[] }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { serverPath: string; lines: string[] },
      ) => callback(payload);
      ipcRenderer.on("server:output", listener);
      return () => ipcRenderer.off("server:output", listener);
    },
  },
  skins: {
    load: (
      launcherPath: string,
      platform: "microsoft" | "discord" | "elyby",
      userId: string,
      nickname: string,
      accessToken: string,
    ) =>
      invoke(
        "skins:load",
        launcherPath,
        platform,
        userId,
        nickname,
        accessToken,
      ),
    selectSkin: (userId: string, platform: string, skinId: string | null) =>
      invoke("skins:selectSkin", userId, platform, skinId),
    setCape: (userId: string, platform: string, capeId: string | undefined) =>
      invoke("skins:setCape", userId, platform, capeId),
    changeModel: (
      userId: string,
      platform: string,
      model: "classic" | "slim",
    ) => invoke("skins:changeModel", userId, platform, model),
    uploadSkin: (userId: string, platform: string, skinPath: string) =>
      invoke("skins:uploadSkin", userId, platform, skinPath),
    deleteSkin: (
      userId: string,
      platform: string,
      skinId: string,
      type: "skin" | "cape",
    ) => invoke("skins:deleteSkin", userId, platform, skinId, type),
    resetSkin: (userId: string, platform: string) =>
      invoke("skins:resetSkin", userId, platform),
    regenerateSkin: (userId: string, platform: string) =>
      invoke("skins:regenerateSkin", userId, platform),
    importByUrl: (
      userId: string,
      platform: string,
      url: string,
      type: "skin" | "cape",
    ) => invoke("skins:importByUrl", userId, platform, url, type),
    importByFile: (
      userId: string,
      platform: string,
      filePath: string,
      type: "skin" | "cape",
    ) =>
      invoke(
        "skins:importByFile",
        userId,
        platform,
        filePath,
        type,
      ),
    importByNickname: (userId: string, platform: string, nickname: string) =>
      invoke("skins:importByNickname", userId, platform, nickname),
    renameSkin: (
      userId: string,
      platform: string,
      skinId: string,
      newName: string,
    ) =>
      invoke("skins:renameSkin", userId, platform, skinId, newName),
    clearManager: (userId: string, platform: string) =>
      invoke("skins:clearManager", userId, platform),
    catalog: {
      list: (params?: CatalogListParams) =>
        invoke("skins:catalogList", params),
      download: (id: string) => invoke("skins:catalogDownload", id),
      get: (id: string) => invoke("skins:catalogItem", id),
    },
    publishCommunity: (
      userId: string,
      platform: string,
      skinId: string,
      backendToken: string,
      name?: string,
      type?: "skin" | "cape" | "pack",
      tags?: string,
    ) =>
      invoke(
        "skins:publishCommunity",
        userId,
        platform,
        skinId,
        backendToken,
        name,
        type,
        tags,
      ),
    tags: {
      suggest: (q?: string, limit?: number) =>
        invoke("skins:tagsSuggest", q, limit),
    },
    importPack: (
      userId: string,
      platform: string,
      skinUrl: string,
      capeUrl: string,
    ) =>
      invoke(
        "skins:importPack",
        userId,
        platform,
        skinUrl,
        capeUrl,
      ),
    community: {
      mine: (backendToken: string) =>
        invoke("skins:communityMine", backendToken),
      delete: (backendToken: string, id: string) =>
        invoke("skins:communityDelete", backendToken, id),
    },
  },
  modManager: {
    search: (
      query: string,
      provider: Provider,
      options: any,
      pagination: any,
    ) =>
      invoke(
        "modManager:search",
        query,
        provider,
        options,
        pagination,
      ),
    getSort: (provider: any) =>
      invoke("modManager:getSort", provider),
    getFilter: (provider: Provider, projectType: ProjectType) =>
      invoke("modManager:getFilter", provider, projectType),
    getProject: (provider: Provider, projectId: string) =>
      invoke("modManager:getProject", provider, projectId),
    getVersions: (provider: Provider, projectId: string, options: any) =>
      invoke(
        "modManager:getVersions",
        provider,
        projectId,
        options,
      ),
    getDependencies: (provider: Provider, projectId: string, deps: any[]) =>
      invoke(
        "modManager:getDependencies",
        provider,
        projectId,
        deps,
      ),
    checkLocalMod: (modPath: string) =>
      invoke("modManager:checkLocalMod", modPath),
    checkModpack: (
      modpackPath: string,
      pack?: any,
      selectVersion?: IVersionModManager,
    ) =>
      invoke(
        "modManager:checkModpack",
        modpackPath,
        pack,
        selectVersion,
      ),
    ptToFolder: (type: ProjectType) =>
      invoke("modManager:ptToFolder", type),
    resolveCfDownload: (fileId: number, fileName: string) =>
      invoke("modManager:resolveCfDownload", fileId, fileName),
    compareMods: (mods1: ILocalProject[], mods2: ILocalProject[]) =>
      invoke("modManager:compareMods", mods1, mods2),
  },
  worlds: {
    loadVersionStatistics: (versionPath: string, account: ILocalAccount) =>
      invoke("worlds:loadVersionStatistics", versionPath, account),
    loadAchievementStats: (account: ILocalAccount) =>
      invoke("worlds:loadAchievementStats", account),
    readWorld: (worldPath: string, account: ILocalAccount) =>
      invoke("worlds:readWorld", worldPath, account),
    writeName: (worldPath: string, newName: string) =>
      invoke("worlds:writeName", worldPath, newName),
    count: (versionPath: string) => invoke("worlds:count", versionPath),
    folderSizes: (versionPath: string) =>
      invoke("worlds:folderSizes", versionPath),
    duplicate: (worldPath: string, newName: string) =>
      invoke("worlds:duplicate", worldPath, newName),
    export: (worldPath: string, destinationDir: string) =>
      invoke("worlds:export", worldPath, destinationDir),
    import: (zipPath: string, versionPath: string) =>
      invoke("worlds:import", zipPath, versionPath),
    listBackups: (worldPath: string) =>
      invoke("worlds:listBackups", worldPath),
    countBackups: (versionPath: string) =>
      invoke("worlds:countBackups", versionPath),
    createBackup: (worldPath: string, keep: number) =>
      invoke("worlds:createBackup", worldPath, keep),
    restoreBackup: (backupId: string, worldPath: string, keep: number) =>
      invoke("worlds:restoreBackup", backupId, worldPath, keep),
    deleteBackup: (backupId: string) =>
      invoke("worlds:deleteBackup", backupId),
    deletePreserved: (targetPath: string) =>
      invoke("worlds:deletePreserved", targetPath),
  },
  worldChunks: {
    dimensions: (worldPath: string) =>
      invoke("worldChunks:dimensions", worldPath),
    regions: (worldPath: string, dimension: string) =>
      invoke("worldChunks:regions", worldPath, dimension),
    scanRegion: (
      worldPath: string,
      dimension: string,
      regionX: number,
      regionZ: number,
    ) => invoke("worldChunks:scanRegion", worldPath, dimension, regionX, regionZ),
    inspect: (
      worldPath: string,
      dimension: string,
      chunkX: number,
      chunkZ: number,
    ) => invoke("worldChunks:inspect", worldPath, dimension, chunkX, chunkZ),
    renderSurface: (
      worldPath: string,
      dimension: string,
      regionX: number,
      regionZ: number,
    ) =>
      invoke(
        "worldChunks:renderSurface",
        worldPath,
        dimension,
        regionX,
        regionZ,
      ),
    delete: (
      worldPath: string,
      dimension: string,
      coords: number[],
      options: IChunkEditOptions,
    ) => invoke("worldChunks:delete", worldPath, dimension, coords, options),
    resetInhabited: (
      worldPath: string,
      dimension: string,
      coords: number[],
      options: IChunkEditOptions,
    ) =>
      invoke(
        "worldChunks:resetInhabited",
        worldPath,
        dimension,
        coords,
        options,
      ),
  },
  statistics: {
    getSyncQueue: () => invoke("statistics:getSyncQueue"),
    resolveSyncEntries: (ids: string[]) =>
      invoke("statistics:resolveSyncEntries", ids),
  },
  ai: {
    prepareCrashReport: (
      versionPath: string,
      exitCode?: number,
      nickname?: string,
      versionName?: string,
      instance?: number,
    ) =>
      invoke(
        "ai:prepareCrashReport",
        versionPath,
        exitCode,
        nickname,
        versionName,
        instance,
      ),
    analyzeCrash: (accessToken: string, requestId: string, locale: string) =>
      invoke("ai:analyzeCrash", accessToken, requestId, locale),
    sendFeedback: (accessToken: string, analysisId: string, helpful: boolean) =>
      invoke(
        "ai:analysisFeedback",
        accessToken,
        analysisId,
        helpful,
      ),
  },
  agent: {
    providers: {
      list: () => invoke("agent:providers:list"),
      save: (input: AiProviderInput) =>
        invoke("agent:providers:save", input),
      remove: (id: string) => invoke("agent:providers:delete", id),
      select: (id: string) => invoke("agent:providers:select", id),
      test: (payload: { id?: string; baseUrl?: string; apiKey?: string }) =>
        invoke("agent:providers:test", payload),
    },
    models: {
      list: (providerId: string) =>
        invoke("agent:models:list", providerId),
    },
    chat: {
      start: (runId: string, request: AgentStreamRequest) =>
        invoke("agent:chat:start", runId, request),
      abort: (runId: string) => invoke("agent:chat:abort", runId),
    },
    chats: {
      list: () => invoke("agent:chats:list"),
      read: (chatId: string) => invoke("agent:chats:read", chatId),
      write: (chat: AgentStoredChat) =>
        invoke("agent:chats:write", chat),
      remove: (chatId: string) =>
        invoke("agent:chats:delete", chatId),
      tombstones: () => invoke("agent:chats:tombstones"),
      forgetTombstone: (remoteId: string) =>
        invoke("agent:chats:forgetTombstone", remoteId),
      sync: (accessToken: string, pending: AgentSyncPush[]) =>
        invoke("agent:chats:sync", accessToken, pending),
      remoteMessages: (accessToken: string, chatId: string) =>
        invoke("agent:chats:remoteMessages", accessToken, chatId),
      remoteRemove: (accessToken: string, chatId: string) =>
        invoke("agent:chats:remoteDelete", accessToken, chatId),
    },
  },
  rpc: {
    syncContext: (context: RpcRendererContext) =>
      invoke("rpc:syncContext", context),
  },
  skin: {
    get: (type: string, uuid: string, nickname: string, accessToken?: string) =>
      invoke("skin:get", type, uuid, nickname, accessToken),
  },
  share: {
    startShare: (visibility: ShareVisibility) =>
      invoke("share:start", visibility),
    stopShare: () => invoke("share:stop"),
    updateShareVisibility: (visibility: ShareVisibility) =>
      invoke("share:updateVisibility", visibility),
    getShareState: () => invoke("share:getState"),
    getSharePeers: () => invoke("share:getPeers"),
    fetchActiveFriendShares: () =>
      invoke("share:fetchActiveFriendShares"),
    connectToFriendShare: (slug: string) =>
      invoke("share:connectToFriendShare", slug),
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
      updateFailedSubscribers.add(callback);
      pendingUpdateFailures.splice(0).forEach((payload) => callback(payload));
      return () => {
        updateFailedSubscribers.delete(callback);
      };
    },

    onIpcError: (
      callback: (payload: {
        channel: string;
        message: string;
        notify?: boolean;
        failure?: FailureInfo;
      }) => void,
    ) => {
      const listener: IpcFailureListener = (payload) => callback(payload);
      ipcFailureListeners.add(listener);
      return () => {
        ipcFailureListeners.delete(listener);
      };
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

    onCrashUnresolved: (
      callback: (payload: ICrashUnresolvedPayload) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: ICrashUnresolvedPayload,
      ) => callback(payload);
      ipcRenderer.on("crashUnresolved", listener);
      return () => ipcRenderer.off("crashUnresolved", listener);
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

    onServerSyncNotice: (callback: (notice: ServerSyncNotice) => void) => {
      const listener = (_event, notice) => {
        callback(notice);
      };
      ipcRenderer.on("server:syncNotice", listener);
      return () => ipcRenderer.off("server:syncNotice", listener);
    },

    onModsQuarantined: (
      callback: (notice: { versionName: string; entries: string[] }) => void,
    ) => {
      const listener = (_event, notice) => {
        callback(notice);
      };
      ipcRenderer.on("mods:quarantined", listener);
      return () => ipcRenderer.off("mods:quarantined", listener);
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

    onAgentStream: (callback: (payload: AgentStreamEvent) => void) => {
      const listener = (_event, payload) => {
        callback(payload);
      };
      ipcRenderer.on("agent:stream", listener);
      return () => ipcRenderer.off("agent:stream", listener);
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
