import { Version } from "./Version";
import { IServerConf, ServerCore } from "@/types/Server";
import { ProjectType } from "@/types/ModManager";
import { DownloadItem } from "@/types/Downloader";
import path from "path";
import { pathToFileURL } from "url";
import fs from "fs-extra";
import { Downloader } from "../utilities/downloader";
import { IVersionConf } from "@/types/IVersion";
import { TSettings } from "@/types/Settings";
import {
  computeServerModExclusions,
  getModDescriptor,
  projetTypeToFolder,
  ServerModNode,
} from "../utilities/modManager";
import { syncServerExtraFiles } from "../utilities/serverManager";
import {
  getClientsideModMatcher,
  getServerSyncDirs,
} from "../utilities/clientsideMods";
import { extractWorldArchive, getWorldName } from "../utilities/worlds";
import {
  VERSION_INSTALL_CANCELLED,
  VersionInstallOperation,
  VersionInstallOptions,
  VersionInstallProgress,
  VersionInstallStage,
} from "@/types/InstallationProgress";
import { mainWindow } from "../windows/mainWindow";
import { OPTIONAL_PROJECT_DOWNLOAD_OPTIONS } from "../utilities/downloaderPure";
import { DownloaderFailuresInfo } from "@/types/Downloader";

const TRASH_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const MODDED_SERVER_CORES = [
  ServerCore.FABRIC,
  ServerCore.QUILT,
  ServerCore.FORGE,
  ServerCore.NEOFORGE,
];

interface ServerModFile {
  filename: string;
  clientPath: string;
  url: string;
  sha1: string;
  size: number;
  isServerFile: boolean;
  clientSupported: boolean;
}

type ModsRuntimeOptions = VersionInstallOptions & {
  signal?: AbortSignal;
};

export class Mods {
  private conf: IVersionConf;
  private version: Version;
  private server: IServerConf | undefined;
  private files: {
    filename: string;
    type: ProjectType;
  }[] = [];
  private downloadLimit = 6;
  private downloader: Downloader;
  private initPromise: Promise<void>;
  private initFailed = false;
  private installOperation: VersionInstallOperation = "install";
  private installAbortSignal: AbortSignal | null = null;
  public lastFailures: DownloaderFailuresInfo | null = null;

  constructor(
    settings: TSettings,
    version: IVersionConf,
    server?: IServerConf,
  ) {
    this.conf = version;
    this.server = server;
    this.downloadLimit = settings.downloadLimit;
    this.downloader = new Downloader(this.downloadLimit);

    this.version = new Version(this.conf);
    this.initPromise = Promise.resolve(this.version.init()).catch(() => {
      this.initFailed = true;
    });
  }

  public cancelInstall() {
    this.downloader.cancelDownload();
  }

  private sendInstallInfo(info: VersionInstallProgress | null) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.webContents.isDestroyed()) return;

    try {
      mainWindow.webContents.send("versionInstallProgress", info);
    } catch {}
  }

  private sendInstallProgress(
    stage: VersionInstallStage,
    progressPercent: number,
    isIndeterminate = false,
    details?: string,
  ) {
    if (!this.installAbortSignal) return;

    this.sendInstallInfo({
      versionName: this.conf.name,
      loaderName: this.conf.loader.name,
      operation: this.installOperation,
      stage,
      progressPercent,
      isIndeterminate,
      details,
    });
  }

  private throwIfInstallCancelled() {
    if (this.installAbortSignal?.aborted) {
      throw new Error(VERSION_INSTALL_CANCELLED);
    }
  }

  private isInstallCancelError(error: unknown) {
    if (this.installAbortSignal?.aborted) return true;
    if (!(error instanceof Error)) return false;

    return (
      error.message === VERSION_INSTALL_CANCELLED ||
      error.message === "AbortError" ||
      error.name === "AbortError"
    );
  }

  private async runWithProgress(
    options: ModsRuntimeOptions | undefined,
    action: () => Promise<void>,
  ) {
    const previousSignal = this.installAbortSignal;
    const previousOperation = this.installOperation;

    this.installAbortSignal = options?.signal ?? null;
    this.installOperation = options?.operation ?? "install";

    try {
      this.throwIfInstallCancelled();
      await action();
      this.throwIfInstallCancelled();
    } catch (error) {
      if (this.isInstallCancelError(error)) {
        throw new Error(VERSION_INSTALL_CANCELLED);
      }

      throw error;
    } finally {
      if (this.installAbortSignal && !options?.keepProgressOpen) {
        this.sendInstallInfo(null);
      }

      this.installAbortSignal = previousSignal;
      this.installOperation = previousOperation;
    }
  }

  async check(options?: ModsRuntimeOptions) {
    await this.runWithProgress(options, () => this.checkInternal());
  }

  private async checkInternal() {
    await this.initPromise;
    this.throwIfInstallCancelled();

    if (this.initFailed || !this.version.versionPath) {
      throw new Error("Mods sync aborted: version initialization failed");
    }

    this.files = [];

    const storagePath = path.join(this.version.versionPath, "storage");

    const downloadFiles: DownloadItem[] = [];
    const serverModFiles: ServerModFile[] = [];
    const worlds: string[] = [];
    const worldZips: string[] = [];
    const savesPath = path.join(
      this.version.versionPath,
      projetTypeToFolder(ProjectType.WORLD),
    );

    for (const mod of this.version.version.loader.mods) {
      if (!mod.version) continue;

      const folderName = projetTypeToFolder(mod.projectType);
      let folderPath = path.join(this.version.versionPath, folderName);

      if (mod.projectType == ProjectType.PLUGIN) {
        if (!this.server) continue;

        const serverPath = path.join(this.version.versionPath, "server");
        folderPath = path.join(serverPath, folderName);
      }

      for (const file of mod.version.files) {
        if (file.url?.startsWith("blocked::") && !file.localPath) continue;

        let filepath = path.join(folderPath, file.filename);

        if (mod.projectType == ProjectType.WORLD) {
          filepath = path.join(storagePath, "worlds", file.filename);

          worldZips.push(filepath);

          const existsStorage = (await fs.pathExists(filepath))
            ? filepath
            : null;
          const existsUrl = file.localPath
            ? (await fs.pathExists(file.localPath))
              ? file.localPath
              : null
            : null;

          const zipPath = existsStorage || existsUrl;
          if (zipPath) {
            const worldName = await getWorldName(zipPath);
            if (worldName) {
              worlds.push(worldName);

              this.files.push({
                filename: worldName,
                type: ProjectType.WORLD,
              });
            }
          }
        }

        const clientSupported = file.isClient !== false;

        if (clientSupported) {
          this.files.push({
            filename: file.filename,
            type: mod.projectType,
          });

          downloadFiles.push({
            destination: filepath,
            url: file.localPath ? pathToFileURL(file.localPath).href : file.url,
            group: "mods",
            sha1: file.sha1,
            size: file.size,
          });
        }

        if (this.isModdedServer() && mod.projectType == ProjectType.MOD) {
          serverModFiles.push({
            filename: file.filename,
            clientPath: filepath,
            url: file.localPath ? pathToFileURL(file.localPath).href : file.url,
            sha1: file.sha1,
            size: file.size,
            isServerFile: file.isServer,
            clientSupported,
          });
        }
      }
    }

    this.sendInstallProgress("mods", 86, true);
    this.lastFailures = await this.downloader.downloadFiles(
      downloadFiles,
      this.installAbortSignal ?? undefined,
      OPTIONAL_PROJECT_DOWNLOAD_OPTIONS,
    );
    this.throwIfInstallCancelled();

    if (this.isModdedServer()) {
      await this.syncServerMods(serverModFiles);
      await syncServerExtraFiles(
        this.version.versionPath,
        this.getServerPath(),
        await getServerSyncDirs(),
      );
      this.throwIfInstallCancelled();
    }

    for (const zipPath of [...new Set(worldZips)]) {
      if (!(await fs.pathExists(zipPath))) continue;

      const worldName = await getWorldName(zipPath);
      if (!worldName) continue;

      const worldPath = path.join(savesPath, worldName);
      if (!(await fs.pathExists(worldPath))) {
        await extractWorldArchive(zipPath, savesPath);
      }

      if (!worlds.includes(worldName)) worlds.push(worldName);

      if (
        !this.files.some(
          (f) => f.type === ProjectType.WORLD && f.filename === worldName,
        )
      ) {
        this.files.push({ filename: worldName, type: ProjectType.WORLD });
      }
    }

    for (const world of worlds) {
      const worldPath = path.join(savesPath, world);
      if (await fs.pathExists(worldPath)) {
        const dlFilePath = path.join(worldPath, ".downloaded");
        if (!(await fs.pathExists(dlFilePath)))
          await fs.writeFile(dlFilePath, "");
      }
    }

    const tasks: Promise<void>[] = [
      this.comparison(ProjectType.MOD),
      this.comparison(ProjectType.RESOURCEPACK),
      this.comparison(ProjectType.SHADER),
      this.comparison(ProjectType.WORLD),
      this.comparison(ProjectType.DATAPACK),
    ];

    if (
      this.server &&
      [
        ServerCore.BUKKIT,
        ServerCore.SPIGOT,
        ServerCore.PAPER,
        ServerCore.PURPUR,
      ].includes(this.server.core)
    ) {
      tasks.push(this.comparison(ProjectType.PLUGIN));
    }

    this.sendInstallProgress("mods", 90, true);
    await Promise.all(tasks);
    this.throwIfInstallCancelled();
    await this.pruneTrash();
  }

  private isModdedServer(): boolean {
    return !!this.server && MODDED_SERVER_CORES.includes(this.server.core);
  }

  private getServerPath() {
    return path.join(this.version.versionPath, "server");
  }

  private async syncServerMods(serverModFiles: ServerModFile[]) {
    const serverModsPath = path.join(this.getServerPath(), "mods");

    const descriptors = new Map<
      string,
      Awaited<ReturnType<typeof getModDescriptor>>
    >();
    const clientMods = serverModFiles.filter((file) => file.clientSupported);
    const CHUNK_SIZE = 16;
    for (let i = 0; i < clientMods.length; i += CHUNK_SIZE) {
      this.throwIfInstallCancelled();
      await Promise.all(
        clientMods.slice(i, i + CHUNK_SIZE).map(async (file) => {
          if (!(await fs.pathExists(file.clientPath))) return;
          descriptors.set(
            file.filename,
            await getModDescriptor(file.clientPath),
          );
        }),
      );
    }

    const isClientside = await getClientsideModMatcher();

    const nodes: ServerModNode[] = serverModFiles.map((file) => {
      const descriptor = descriptors.get(file.filename);
      let onServer: boolean;
      if (!file.isServerFile) onServer = false;
      else if (isClientside(file.filename)) onServer = false;
      else if (!file.clientSupported) onServer = true;
      else onServer = (descriptor?.environment ?? "both") !== "client";

      return {
        key: file.filename,
        modId: descriptor?.modId ?? null,
        hardDeps: descriptor?.hardDeps ?? [],
        onServer,
      };
    });

    const excludedKeys = computeServerModExclusions(nodes);
    const onServerByKey = new Map(
      nodes.map((node) => [node.key, node.onServer]),
    );

    const downloads: DownloadItem[] = [];
    for (const file of serverModFiles) {
      const destination = path.join(serverModsPath, file.filename);
      const keep =
        onServerByKey.get(file.filename) === true &&
        !excludedKeys.has(file.filename);

      if (!keep) {
        if (await fs.pathExists(destination))
          await this.moveToTrash([destination]);
        continue;
      }

      if (file.clientSupported && (await fs.pathExists(file.clientPath))) {
        await fs
          .copy(file.clientPath, destination, { overwrite: true })
          .catch(() => {});
      } else {
        downloads.push({
          destination,
          url: file.url,
          group: "mods",
          sha1: file.sha1,
          size: file.size,
        });
      }
    }

    if (downloads.length > 0) {
      const serverFailures = await this.downloader.downloadFiles(
        downloads,
        this.installAbortSignal ?? undefined,
        OPTIONAL_PROJECT_DOWNLOAD_OPTIONS,
      );

      if (serverFailures) {
        this.lastFailures = this.lastFailures
          ? {
              totalItems:
                this.lastFailures.totalItems + serverFailures.totalItems,
              completedItems:
                this.lastFailures.completedItems +
                serverFailures.completedItems,
              failedItems:
                this.lastFailures.failedItems + serverFailures.failedItems,
              failures: [
                ...this.lastFailures.failures,
                ...serverFailures.failures,
              ],
            }
          : serverFailures;
      }
    }
  }

  private getTrashPath() {
    return path.join(this.version.versionPath, "storage", "trash");
  }

  private async moveToTrash(files: string[]) {
    if (files.length === 0) return;

    const trashPath = this.getTrashPath();
    await fs.ensureDir(trashPath);

    await Promise.all(
      files.map(async (file) => {
        const target = path.join(
          trashPath,
          `${Date.now()}-${path.basename(file)}`,
        );

        try {
          await fs.move(file, target, { overwrite: true });
        } catch {
          await fs.remove(file).catch(() => {});
        }
      }),
    );
  }

  private async pruneTrash() {
    const trashPath = this.getTrashPath();
    const entries = await fs.readdir(trashPath).catch(() => [] as string[]);

    for (const entry of entries) {
      const match = /^(\d{13})-/.exec(entry);
      const entryPath = path.join(trashPath, entry);

      let createdAt = match ? Number(match[1]) : 0;
      if (!createdAt) {
        const stats = await fs.stat(entryPath).catch(() => null);
        createdAt = stats?.mtimeMs ?? 0;
      }

      if (Date.now() - createdAt > TRASH_MAX_AGE_MS) {
        await fs.remove(entryPath).catch(() => {});
      }
    }
  }

  private async comparison(projectType: ProjectType) {
    const storagePath = path.join(this.version.versionPath, "storage");
    const folderName = projetTypeToFolder(projectType);

    let folderPath = path.join(this.version.versionPath, folderName);
    if (this.server && projectType == ProjectType.PLUGIN) {
      const serverPath = path.join(this.version.versionPath, "server");
      folderPath = path.join(serverPath, folderName);
    }

    const isExists = await fs.pathExists(folderPath);
    if (!isExists) return;

    const filenames = this.files
      .filter((f) => f.type == projectType)
      .map((f) => f.filename);
    const files = await fs.readdir(folderPath);
    const deleteFiles: string[] = [];

    for (const file of files) {
      const filePath = path.join(folderPath, file);

      let isDirectory = false;
      try {
        isDirectory = fs.lstatSync(filePath).isDirectory();
      } catch {
        continue;
      }

      if (
        projectType == ProjectType.WORLD &&
        isDirectory &&
        !(await fs.pathExists(path.join(filePath, ".downloaded")))
      )
        continue;

      if (
        (isDirectory && projectType != ProjectType.WORLD) ||
        filenames.includes(file.replace(".disabled", ""))
      )
        continue;

      deleteFiles.push(filePath);
      if (this.isModdedServer()) {
        const serverFilePath = path.join(
          this.version.versionPath,
          "server",
          folderName,
          file,
        );
        const isServerFileExists = await fs.pathExists(serverFilePath);
        if (isServerFileExists) deleteFiles.push(serverFilePath);
      }
    }

    if (projectType == ProjectType.WORLD) {
      const worldsPath = path.join(storagePath, "worlds");
      if (await fs.pathExists(worldsPath)) {
        const files = await fs.readdir(worldsPath);

        for (const file of files)
          if (!filenames.includes(file))
            deleteFiles.push(path.join(worldsPath, file));
      }
    }

    await this.moveToTrash(deleteFiles);
  }

  async downloadOther(options?: ModsRuntimeOptions) {
    await this.runWithProgress(options, () => this.downloadOtherInternal());
  }

  private async downloadOtherInternal() {
    await this.initPromise;
    this.throwIfInstallCancelled();

    if (!this.version.version.loader.other) return;

    const tempPath = path.join(this.version.versionPath, "temp");

    try {
      this.sendInstallProgress("other", 94, true);
      this.lastFailures = await this.downloader.downloadFiles(
        [
          {
            destination: path.join(tempPath, "other.zip"),
            group: "other",
            url: this.version.version.loader.other.url,
            options: {
              extract: true,
              extractFolder: this.version.versionPath,
            },
          },
        ],
        this.installAbortSignal ?? undefined,
        OPTIONAL_PROJECT_DOWNLOAD_OPTIONS,
      );
      this.throwIfInstallCancelled();

      if (this.isModdedServer()) {
        await syncServerExtraFiles(
          this.version.versionPath,
          this.getServerPath(),
          await getServerSyncDirs(),
        );
      }
    } finally {
      await fs.remove(tempPath).catch(() => {});
    }
  }

  async syncLive(options?: ModsRuntimeOptions) {
    await this.runWithProgress(options, () => this.syncLiveInternal());
  }

  private async syncLiveInternal() {
    await this.initPromise;
    this.throwIfInstallCancelled();

    if (this.initFailed || !this.version.versionPath) {
      throw new Error("Live sync aborted: version initialization failed");
    }

    const downloadFiles: DownloadItem[] = [];

    for (const mod of this.version.version.loader.mods) {
      if (!mod.version) continue;
      if (
        mod.projectType != ProjectType.RESOURCEPACK &&
        mod.projectType != ProjectType.SHADER
      )
        continue;

      const folderPath = path.join(
        this.version.versionPath,
        projetTypeToFolder(mod.projectType),
      );

      for (const file of mod.version.files) {
        if (file.url?.startsWith("blocked::") && !file.localPath) continue;
        if (file.isClient === false) continue;

        downloadFiles.push({
          destination: path.join(folderPath, file.filename),
          url: file.localPath ? pathToFileURL(file.localPath).href : file.url,
          group: "mods",
          sha1: file.sha1,
          size: file.size,
        });
      }
    }

    this.sendInstallProgress("mods", 90, true);
    this.lastFailures = await this.downloader.downloadFiles(
      downloadFiles,
      this.installAbortSignal ?? undefined,
      OPTIONAL_PROJECT_DOWNLOAD_OPTIONS,
    );
    this.throwIfInstallCancelled();
  }
}
