import { Loader } from "@/types/Loader";
import {
  ILocalIdentifyRequest,
  ILocalIdentifyResult,
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
import { assertReadablePath, assertWritablePath } from "../utilities/safePath";
import { ManagedFiles, readManagedFiles } from "../game/managedFiles";
import { moveFilesToTrash } from "../game/trash";
import path from "path";
import fs from "fs-extra";

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

  handleSafe<ManagedFiles | null, [string]>(
    "modManager:managedFiles",
    null,
    [isPath],
    async (_, versionPath: string) => {
      assertReadablePath(versionPath, "modManager:managedFiles");
      return await readManagedFiles(versionPath);
    },
  );

  handleSafe<Record<string, boolean> | null, [string[]]>(
    "modManager:modrinthClientSides",
    null,
    [check.arrayOf(check.nonEmptyString(64), 5000)],
    async (_, ids: string[]) => await ModManager.modrinthClientSides(ids),
  );

  handleSafe<ILocalIdentifyResult, [ILocalIdentifyRequest[]]>(
    "modManager:identifyLocal",
    { matches: [], unavailable: [Provider.CURSEFORGE, Provider.MODRINTH] },
    [check.arrayOf(check.object(), 5000)],
    async (_, requests: ILocalIdentifyRequest[]) => {
      const valid = requests.filter(
        (request) =>
          typeof request?.key === "string" &&
          request.key.length > 0 &&
          request.key.length <= 512 &&
          typeof request.path === "string" &&
          typeof request.sha1 === "string" &&
          request.sha1.length <= 64 &&
          Object.values(ProjectType).includes(request.projectType) &&
          (request.gameVersion === undefined ||
            (typeof request.gameVersion === "string" &&
              request.gameVersion.length <= 64)),
      );

      for (const request of valid) {
        assertReadablePath(request.path, "modManager:identifyLocal");
      }

      return await ModManager.identifyLocalFiles(valid);
    },
  );

  handleSafe<Record<string, number>, [string, ProjectType]>(
    "modManager:fileTimes",
    {},
    [isPath, isProjectType],
    async (_, versionPath: string, projectType: ProjectType) => {
      const folder = path.join(versionPath, projetTypeToFolder(projectType));
      assertReadablePath(folder, "modManager:fileTimes");

      const names = await fs.readdir(folder).catch(() => [] as string[]);
      const times: Record<string, number> = {};

      await Promise.all(
        names.map(async (name) => {
          const stats = await fs.stat(path.join(folder, name)).catch(() => null);
          if (stats?.isFile()) times[name] = stats.mtimeMs;
        }),
      );

      return times;
    },
  );

  handleSafe<string[], [string, ProjectType, string[]]>(
    "modManager:trashFiles",
    [],
    [isPath, isProjectType, check.arrayOf(check.nonEmptyString(512), 5000)],
    async (_, versionPath: string, projectType: ProjectType, names: string[]) => {
      const folder = path.join(versionPath, projetTypeToFolder(projectType));
      assertWritablePath(folder, "modManager:trashFiles");

      const files = names
        .filter((name) => path.basename(name) === name)
        .map((name) => path.join(folder, name));

      return await moveFilesToTrash(
        path.join(versionPath, "storage", "trash"),
        files,
        () => "foreign",
      );
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
