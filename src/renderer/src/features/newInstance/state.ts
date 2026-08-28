import type { IArguments } from "@/types/IArguments";
import type { Loader } from "@/types/Loader";
import type { IModpackFile, IVersion, IVersionConf } from "@/types/IVersion";
import type {
  ILocalProject,
  IModpack as IImportedModpack,
  Provider,
} from "@/types/ModManager";
import type { IServer } from "@/types/ServersList";
import type { IUser } from "@/types/IUser";
import type { LoaderVersion } from "@/types/VersionsService";
import type { ServerTarget } from "./serverTarget";
import { pickDefaultVersion, toVersionEntries } from "./versionCatalog";

export type NewInstanceSource =
  | "custom"
  | "community"
  | "catalog"
  | "code"
  | "file"
  | "server";

export type PackKind = "share" | "file" | "modpack";

export type LoaderVersionIssue = "missingRequired" | "notFound" | null;

export type PackVersionIssue = "catalogFailed" | "versionMissing" | null;

export function packVersionIssue(resolution: {
  catalogFailed: boolean;
  versionMissing: boolean;
}): PackVersionIssue {
  if (resolution.catalogFailed) return "catalogFailed";
  if (resolution.versionMissing) return "versionMissing";

  return null;
}

export interface PackAuthor {
  id: string;
  nickname: string;
  platform: IUser["platform"] | null;
  headUrl: string | null;
}

export interface AppliedPack {
  kind: PackKind;
  title: string;
  description?: string;
  provider?: Provider;
  isOwner: boolean;
  author?: PackAuthor;
  downloads?: number;
  shareCode?: string;
  shareVersion?: IVersionConf;
  importData?: IModpackFile;
  importModpack?: IImportedModpack;
}

export interface NewInstanceState {
  source: NewInstanceSource;
  pack: AppliedPack | null;
  name: string;
  nameEdited: boolean;
  image: string;
  loader: Loader;
  minecraftVersion?: IVersion;
  loaderVersion?: LoaderVersion;
  versions: IVersion[];
  loaderVersions: LoaderVersion[];
  showSnapshots: boolean;
  mods: ILocalProject[];
  servers: IServer[];
  options: string;
  runArguments: IArguments;
  quickServer: string;
  serverAddress: string;
  serverTarget: ServerTarget | null;
  loaderVersionIssue: LoaderVersionIssue;
  packVersionIssue: PackVersionIssue;
}

export type NewInstanceAction =
  | { type: "selectSource"; source: NewInstanceSource }
  | { type: "setName"; value: string }
  | { type: "autoName"; value: string }
  | { type: "setImage"; value: string }
  | { type: "selectLoader"; loader: Loader }
  | { type: "setSnapshots"; value: boolean }
  | { type: "versionsLoaded"; versions: IVersion[]; preferredId?: string }
  | { type: "selectVersion"; version: IVersion }
  | {
      type: "loaderVersionsLoaded";
      versions: LoaderVersion[];
      selected?: LoaderVersion;
      issue?: LoaderVersionIssue;
    }
  | { type: "selectLoaderVersion"; version: LoaderVersion }
  | {
      type: "applyPack";
      pack: AppliedPack;
      content: PackContent;
      versionIssue?: PackVersionIssue;
    }
  | {
      type: "packVersionsResolved";
      minecraftVersion?: IVersion;
      loaderVersion?: LoaderVersion;
      loaderVersions: LoaderVersion[];
      issue: LoaderVersionIssue;
      versionIssue: PackVersionIssue;
    }
  | { type: "clearPack" }
  | { type: "setMods"; mods: ILocalProject[] }
  | { type: "setServers"; servers: IServer[] }
  | { type: "setRunArguments"; value: IArguments }
  | { type: "setQuickServer"; value: string }
  | { type: "setServerAddress"; value: string }
  | {
      type: "applyServer";
      target: ServerTarget;
      server: IServer;
      logo?: string;
    }
  | { type: "clearServer" };

export interface PackContent {
  name: string;
  image: string;
  loader: Loader;
  minecraftVersion?: IVersion;
  loaderVersion?: LoaderVersion;
  mods: ILocalProject[];
  servers: IServer[];
  options: string;
  runArguments: IArguments;
  quickServer: string;
}

export const EMPTY_ARGUMENTS: IArguments = { game: "", jvm: "" };

export function createInitialState(
  source: NewInstanceSource = "custom",
): NewInstanceState {
  return {
    source,
    pack: null,
    name: "",
    nameEdited: false,
    image: "",
    loader: "vanilla",
    minecraftVersion: undefined,
    loaderVersion: undefined,
    versions: [],
    loaderVersions: [],
    showSnapshots: false,
    mods: [],
    servers: [],
    options: "",
    runArguments: EMPTY_ARGUMENTS,
    quickServer: "",
    serverAddress: "",
    serverTarget: null,
    loaderVersionIssue: null,
    packVersionIssue: null,
  };
}

export function isPackLocked(state: NewInstanceState): boolean {
  return state.pack !== null;
}

export function needsPackPicker(state: NewInstanceState): boolean {
  if (state.source === "custom") return false;
  if (state.source === "server") return state.serverTarget === null;

  return state.pack === null;
}

export function newInstanceReducer(
  state: NewInstanceState,
  action: NewInstanceAction,
): NewInstanceState {
  switch (action.type) {
    case "selectSource": {
      if (action.source === state.source) return state;

      return {
        ...createInitialState(action.source),
        showSnapshots: state.showSnapshots,
      };
    }

    case "setName":
      return { ...state, name: action.value, nameEdited: true };

    case "autoName":
      if (state.nameEdited || state.name === action.value) return state;
      return { ...state, name: action.value };

    case "setImage":
      return { ...state, image: action.value };

    case "selectLoader": {
      if (action.loader === state.loader || isPackLocked(state)) return state;

      return {
        ...state,
        loader: action.loader,
        versions: [],
        loaderVersions: [],
        minecraftVersion: undefined,
        loaderVersion: undefined,
        loaderVersionIssue: null,
      };
    }

    case "setSnapshots": {
      if (action.value === state.showSnapshots) return state;

      return {
        ...state,
        showSnapshots: action.value,
        versions: [],
        loaderVersions: [],
        loaderVersion: undefined,
      };
    }

    case "versionsLoaded": {
      const entries = toVersionEntries(action.versions);
      const preferred =
        action.preferredId ?? state.minecraftVersion?.id ?? undefined;

      return {
        ...state,
        versions: action.versions,
        minecraftVersion: pickDefaultVersion(entries, preferred)?.version,
      };
    }

    case "selectVersion": {
      if (action.version.id === state.minecraftVersion?.id) return state;

      return {
        ...state,
        minecraftVersion: action.version,
        loaderVersions: [],
        loaderVersion: undefined,
        loaderVersionIssue: null,
      };
    }

    case "loaderVersionsLoaded":
      return {
        ...state,
        loaderVersions: action.versions,
        loaderVersion: action.issue
          ? undefined
          : (action.selected ?? action.versions[0]),
        loaderVersionIssue: action.issue ?? null,
      };

    case "selectLoaderVersion":
      return {
        ...state,
        loaderVersion: action.version,
        loaderVersionIssue: null,
      };

    case "applyPack":
      return {
        ...state,
        pack: action.pack,
        name: action.content.name,
        nameEdited: false,
        image: action.content.image,
        loader: action.content.loader,
        minecraftVersion: action.content.minecraftVersion,
        loaderVersion: action.content.loaderVersion,
        versions: action.content.minecraftVersion
          ? [action.content.minecraftVersion]
          : [],
        loaderVersions: action.content.loaderVersion
          ? [action.content.loaderVersion]
          : [],
        mods: action.content.mods,
        servers: action.content.servers,
        options: action.content.options,
        runArguments: action.content.runArguments,
        quickServer: action.content.quickServer,
        loaderVersionIssue: null,
        packVersionIssue: action.versionIssue ?? null,
      };

    case "packVersionsResolved":
      return {
        ...state,
        minecraftVersion: action.minecraftVersion,
        versions: action.minecraftVersion ? [action.minecraftVersion] : [],
        loaderVersion: action.issue ? undefined : action.loaderVersion,
        loaderVersions: action.loaderVersions,
        loaderVersionIssue: action.issue,
        packVersionIssue: action.versionIssue,
      };

    case "clearPack":
      return {
        ...createInitialState(state.source),
        showSnapshots: state.showSnapshots,
        serverAddress: state.serverAddress,
      };

    case "setMods":
      return { ...state, mods: action.mods };

    case "setServers":
      return { ...state, servers: action.servers };

    case "setRunArguments":
      return { ...state, runArguments: action.value };

    case "setQuickServer":
      return { ...state, quickServer: action.value };

    case "setServerAddress":
      return { ...state, serverAddress: action.value };

    case "applyServer":
      return {
        ...state,
        serverTarget: action.target,
        servers: [action.server],
        quickServer: action.target.address,
        image: action.logo ?? "",
      };

    case "clearServer":
      return {
        ...state,
        serverTarget: null,
        servers: [],
        quickServer: "",
      };

    default:
      return state;
  }
}
