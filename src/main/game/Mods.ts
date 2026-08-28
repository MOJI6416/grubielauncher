import { Version } from "./Version";
import { IServerConf, ServerCore } from "@/types/Server";
import { ProjectType } from "@/types/ModManager";
import { DownloadItem } from "@/types/Downloader";
import path from "path";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";
import fs from "fs-extra";
import {
  Downloader,
  waitWhileDownloadsPaused,
} from "../utilities/downloader";
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
import { toSafeFileName } from "./serverScriptSafety";
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
const DISABLED_SUFFIX = ".disabled";

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
  disabled: boolean;
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
    this.downloader.versionName = this.conf.name;

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

  private sendQuarantineNotice(entries: string[]) {
    if (entries.length === 0) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.webContents.isDestroyed()) return;

    try {
      mainWindow.webContents.send("mods:quarantined", {
        versionName: this.version.version.name,
        entries,
      });
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

  private async installCheckpoint() {
    this.throwIfInstallCancelled();
    await waitWhileDownloadsPaused(
      () => this.installAbortSignal?.aborted === true,
    );
    this.throwIfInstallCancelled();
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

    let succeeded = false;

    try {
      await this.installCheckpoint();
      await action();
      await this.installCheckpoint();
      succeeded = true;
    } catch (error) {
      if (this.isInstallCancelError(error)) {
        throw new Error(VERSION_INSTALL_CANCELLED);
      }

      throw error;
    } finally {
      if (!succeeded || (this.installAbortSignal && !options?.keepProgressOpen)) {
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
    await this.installCheckpoint();

    if (this.initFailed || !this.version.versionPath) {
      throw new Error("Mods sync aborted: version initialization failed");
    }

    this.files = [];

    const storagePath = path.join(this.version.versionPath, "storage");

    const downloadFiles: DownloadItem[] = [];
    const serverModFiles: ServerModFile[] = [];
    const worlds: string[] = [];
    const worldZips: string[] = [];
    let isWorldListComplete = true;

    const readWorldName = async (zipPath: string) => {
      try {
        return await getWorldName(zipPath);
      } catch (error) {
        console.error(
          `[mods:worlds] cannot read the world archive ${zipPath}:`,
          error,
        );
        isWorldListComplete = false;
        return null;
      }
    };
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
        const filename = toSafeFileName(file.filename, "mod file name");

        if (file.url?.startsWith("blocked::") && !file.localPath) {
          if (file.isClient !== false) {
            this.files.push({ filename, type: mod.projectType });
          }
          continue;
        }

        let filepath = path.join(folderPath, filename);

        if (mod.projectType == ProjectType.WORLD) {
          filepath = path.join(storagePath, "worlds", filename);

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
          if (!zipPath) {
            isWorldListComplete = false;
          } else {
            const worldName = await readWorldName(zipPath);
            if (!worldName) {
              isWorldListComplete = false;
            } else {
              worlds.push(worldName);

              this.files.push({
                filename: worldName,
                type: ProjectType.WORLD,
              });
            }
          }
        }

        const clientSupported = file.isClient !== false;
        const disabledPath = `${filepath}${DISABLED_SUFFIX}`;
        const existsDisabled =
          clientSupported && (await fs.pathExists(disabledPath));
        const disabled =
          clientSupported &&
          (existsDisabled ||
            (file.disabled === true && !(await fs.pathExists(filepath))));

        if (clientSupported) {
          this.files.push({
            filename,
            type: mod.projectType,
          });

          if (!disabled || !existsDisabled) {
            downloadFiles.push({
              destination: disabled ? disabledPath : filepath,
              url: file.localPath
                ? pathToFileURL(file.localPath).href
                : file.url,
              group: "mods",
              sha1: file.sha1,
              size: file.size,
            });
          }
        }

        if (this.isModdedServer() && mod.projectType == ProjectType.MOD) {
          serverModFiles.push({
            filename,
            clientPath: filepath,
            url: file.localPath ? pathToFileURL(file.localPath).href : file.url,
            sha1: file.sha1,
            size: file.size,
            isServerFile: file.isServer,
            clientSupported,
            disabled,
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
    await this.installCheckpoint();

    if (this.isModdedServer()) {
      await this.syncServerMods(serverModFiles);
      await syncServerExtraFiles(
        this.version.versionPath,
        this.getServerPath(),
        await getServerSyncDirs(),
      );
      await this.installCheckpoint();
    }

    for (const zipPath of [...new Set(worldZips)]) {
      if (!(await fs.pathExists(zipPath))) {
        isWorldListComplete = false;
        continue;
      }

      const worldName = await readWorldName(zipPath);
      if (!worldName) {
        isWorldListComplete = false;
        continue;
      }

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

    if (!isWorldListComplete) {
      console.error(
        `[mods:worlds] keeping every world of ${this.version.versionPath}: the world list of this instance could not be read in full`,
      );
    }

    const tasks: Promise<string[]>[] = [
      this.comparison(ProjectType.MOD),
      this.comparison(ProjectType.RESOURCEPACK),
      this.comparison(ProjectType.SHADER),
      this.comparison(ProjectType.DATAPACK),
    ];

    if (isWorldListComplete) tasks.push(this.comparison(ProjectType.WORLD));

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
    const quarantined = (await Promise.all(tasks)).flat();
    this.sendQuarantineNotice(quarantined);
    await this.installCheckpoint();
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
      await this.installCheckpoint();
      await Promise.all(
        clientMods.slice(i, i + CHUNK_SIZE).map(async (file) => {
          const descriptorPath = file.disabled
            ? `${file.clientPath}.disabled`
            : file.clientPath;
          if (!(await fs.pathExists(descriptorPath))) return;
          descriptors.set(file.filename, await getModDescriptor(descriptorPath));
        }),
      );
    }

    const isClientside = await getClientsideModMatcher();

    const nodes: ServerModNode[] = serverModFiles.map((file) => {
      const descriptor = descriptors.get(file.filename);
      let onServer: boolean;
      if (!file.isServerFile) onServer = false;
      else if (file.disabled) onServer = false;
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
        const copied = await fs
          .copy(file.clientPath, destination, { overwrite: true })
          .then(() => true)
          .catch((error) => {
            console.error(
              `[mods:server] could not copy ${file.clientPath} to ${destination}:`,
              error,
            );
            return false;
          });

        if (!copied) {
          await fs.remove(destination).catch(() => {});
          downloads.push({
            destination,
            url: file.url,
            group: "mods",
            sha1: file.sha1,
            size: file.size,
          });
        }
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

  private async moveToTrash(files: string[]): Promise<string[]> {
    if (files.length === 0) return [];

    const trashPath = this.getTrashPath();

    try {
      await fs.ensureDir(trashPath);
    } catch (error) {
      console.error(
        `[mods:trash] kept ${files.length} file(s) in place: the quarantine folder ${trashPath} is not usable:`,
        error,
      );
      return [];
    }

    const moved: string[] = [];

    await Promise.all(
      files.map(async (file) => {
        const target = path.join(
          trashPath,
          `${Date.now()}-${randomUUID().slice(0, 8)}-${path.basename(file)}`,
        );

        try {
          await fs.move(file, target, { overwrite: true });
          moved.push(path.basename(file));
        } catch (error) {
          console.error(
            `[mods:trash] kept ${file} in place: moving it to the quarantine failed:`,
            error,
          );
        }
      }),
    );

    return moved;
  }

  private async pruneTrash() {
    const trashPath = this.getTrashPath();
    const entries = await fs.readdir(trashPath).catch(() => [] as string[]);

    for (const entry of entries) {
      const match = /^(\d{13})-/.exec(entry);
      const entryPath = path.join(trashPath, entry);
      const stats = await fs.lstat(entryPath).catch(() => null);
      if (!stats || stats.isDirectory()) continue;

      let createdAt = match ? Number(match[1]) : 0;
      if (!createdAt) createdAt = stats.mtimeMs;

      if (Date.now() - createdAt > TRASH_MAX_AGE_MS) {
        await fs.remove(entryPath).catch(() => {});
      }
    }
  }

  private async comparison(projectType: ProjectType): Promise<string[]> {
    const storagePath = path.join(this.version.versionPath, "storage");
    const folderName = projetTypeToFolder(projectType);

    let folderPath = path.join(this.version.versionPath, folderName);
    if (this.server && projectType == ProjectType.PLUGIN) {
      const serverPath = path.join(this.version.versionPath, "server");
      folderPath = path.join(serverPath, folderName);
    }

    const isExists = await fs.pathExists(folderPath);
    if (!isExists) return [];

    const filenames = this.files
      .filter((f) => f.type == projectType)
      .map((f) => f.filename);
    const files = await fs.readdir(folderPath);
    const deleteFiles: string[] = [];

    for (const file of files) {
      const filePath = path.join(folderPath, file);

      let isDirectory = false;
      try {
        isDirectory = (await fs.lstat(filePath)).isDirectory();
      } catch {
        continue;
      }

      if (
        projectType == ProjectType.WORLD &&
        isDirectory &&
        !(await fs.pathExists(path.join(filePath, ".downloaded")))
      )
        continue;

      const enabledName = file.endsWith(DISABLED_SUFFIX)
        ? file.slice(0, -DISABLED_SUFFIX.length)
        : file;

      if (
        (isDirectory && projectType != ProjectType.WORLD) ||
        filenames.includes(enabledName)
      )
        continue;

      deleteFiles.push(filePath);
      if (this.isModdedServer()) {
        const serverFilePath = path.join(
          this.version.versionPath,
          "server",
          folderName,
          enabledName,
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

    return await this.moveToTrash(deleteFiles);
  }

  async downloadOther(options?: ModsRuntimeOptions) {
    await this.runWithProgress(options, () => this.downloadOtherInternal());
  }

  private async downloadOtherInternal() {
    await this.initPromise;
    await this.installCheckpoint();

    if (this.initFailed || !this.version.versionPath) {
      throw new Error("Extra files sync aborted: version initialization failed");
    }

    if (!this.version.version.loader.other) return;

    const otherUrl = this.version.version.loader.other.url;

    const tempPath = path.join(this.version.versionPath, "temp");

    try {
      if (otherUrl) {
        this.sendInstallProgress("other", 94, true);
        this.lastFailures = await this.downloader.downloadFiles(
          [
            {
              destination: path.join(tempPath, "other.zip"),
              group: "other",
              url: otherUrl,
              options: {
                extract: true,
                extractFolder: this.version.versionPath,
                keepExistingWorlds: true,
              },
            },
          ],
          this.installAbortSignal ?? undefined,
          OPTIONAL_PROJECT_DOWNLOAD_OPTIONS,
        );
        await this.installCheckpoint();
      }

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
    await this.installCheckpoint();

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

        const filepath = path.join(
          folderPath,
          toSafeFileName(file.filename, "mod file name"),
        );
        if (await fs.pathExists(`${filepath}${DISABLED_SUFFIX}`)) continue;
        if (file.disabled === true && !(await fs.pathExists(filepath))) continue;

        downloadFiles.push({
          destination: filepath,
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
    await this.installCheckpoint();
  }
}
