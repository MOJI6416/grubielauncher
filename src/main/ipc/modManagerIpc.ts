import { Loader } from "@/types/Loader";
import {
  ILocalProject,
  IProject,
  ISearchData,
  IVersion,
  IVersionDependency,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { ServerCore } from "@/types/Server";
import { ModManager } from "../services/ModManager";
import {
  checkLocalMod,
  checkModpack,
  compareMods,
  projetTypeToFolder,
  resolveCurseForgeCdnUrl,
} from "../utilities/modManager";
import { check, handleSafe } from "../utilities/ipc";
import { assertReadablePath } from "../utilities/safePath";

const isProvider = check.oneOf(...Object.values(Provider));
const isProjectType = check.oneOf(...Object.values(ProjectType));
const isProjectId = check.nonEmptyString(256);
const isPath = check.nonEmptyString(4096);
const isOptions = check.object();
const isProjectList = check.arrayOf(check.object(), 20000);

export function registerModManagerIpc() {
  handleSafe(
    "modManager:search",
    (
      _query: string,
      _provider: Provider,
      _options: any,
      pagination: { offset: number; limit: number },
    ): ISearchData => ({
      projects: [],
      limit: pagination?.limit ?? 0,
      offset: 0,
      total: 0,
      error: true,
    }),
    [check.string(512), isProvider, isOptions, isOptions],
    async (
      _,
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
    ) => {
      return await ModManager.search(query, provider, options, pagination);
    },
  );

  handleSafe<string[]>(
    "modManager:getSort",
    [],
    [isProvider],
    async (_, provider: Provider) => {
      return ModManager.getSort(provider);
    },
  );

  handleSafe<any[]>(
    "modManager:getFilter",
    [],
    [isProvider, isProjectType],
    async (_, provider: Provider, projectType: ProjectType) => {
      return ModManager.getFilter(provider, projectType);
    },
  );

  handleSafe<IProject | null>(
    "modManager:getProject",
    null,
    [isProvider, isProjectId],
    async (_, provider: Provider, projectId: string) => {
      return await ModManager.getProject(provider, projectId);
    },
  );

  handleSafe<IVersion[]>(
    "modManager:getVersions",
    [],
    [isProvider, isProjectId, isOptions],
    async (
      _,
      provider: Provider,
      projectId: string,
      options: {
        version?: string;
        loader?: Loader;
        projectType: ProjectType;
        modUrl: string;
      },
    ) => {
      return await ModManager.getVersions(provider, projectId, options);
    },
  );

  handleSafe<IVersionDependency[] | null>(
    "modManager:getDependencies",
    null,
    [isProvider, isProjectId, check.arrayOf(check.object(), 1000)],
    async (
      _,
      provider: Provider,
      projectId: string,
      deps: IVersionDependency[],
    ) => {
      return await ModManager.getDependencies(provider, projectId, deps);
    },
  );

  handleSafe(
    "modManager:checkLocalMod",
    null,
    [isPath],
    async (_, modPath: string) => {
      assertReadablePath(modPath, "modManager:checkLocalMod");
      return await checkLocalMod(modPath);
    },
  );

  handleSafe(
    "modManager:checkModpack",
    null,
    [isPath, check.optional(check.object()), check.optional(check.object())],
    async (
      _,
      modpackPath: string,
      pack?: IProject,
      selectVersion?: IVersion,
    ) => {
      assertReadablePath(modpackPath, "modManager:checkModpack");
      return await checkModpack(modpackPath, pack, selectVersion);
    },
  );

  handleSafe<string>(
    "modManager:ptToFolder",
    "",
    [isProjectType],
    async (_, pt: ProjectType) => {
      return projetTypeToFolder(pt);
    },
  );

  handleSafe<string | null>(
    "modManager:resolveCfDownload",
    null,
    [check.integer(), check.nonEmptyString(512)],
    async (_, fileId: number, fileName: string) => {
      return await resolveCurseForgeCdnUrl(fileId, fileName);
    },
  );

  handleSafe<boolean>(
    "modManager:compareMods",
    false,
    [isProjectList, isProjectList],
    async (_, mods1: ILocalProject[], mods2: ILocalProject[]) => {
      return compareMods(mods1, mods2);
    },
  );
}
